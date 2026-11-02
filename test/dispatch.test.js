import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, writeFile, chmod, rm, access} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const source = await readFile(new URL("../skills/delegate/dispatch.js", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runTemplate = new AsyncFunction("jobs", "tools", "text", source);

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-delegate-test-"));
  const bin = path.join(root, "bin");
  const cwd = path.join(root, "project's files");
  await mkdir(bin);
  await mkdir(cwd);
  await writeFile(path.join(bin, "pi"), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const args = process.argv.slice(2);
const task = args.find(arg => arg.startsWith('@')).slice(1);
const dir = path.dirname(task);
fs.writeFileSync(path.join(dir, 'args.json'), JSON.stringify({args, cwd: process.cwd()}));
const prompt = fs.readFileSync(task, 'utf8');
if (prompt === 'FAIL') {
  process.stdout.write('partial report');
  process.stderr.write('fixture failure');
  process.exitCode = 7;
} else if (prompt === 'EMPTY') {
  process.exitCode = 0;
} else if (prompt === 'SLOW') {
  const code = "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'orphan'), 3000)";
  spawn(process.execPath, ['-e', code, path.join(dir, 'orphan-marker')], {stdio: 'ignore'});
  setTimeout(() => {}, 10000);
} else {
  process.stdout.write('# Summary\\nFixture report: ' + prompt + '\\n');
  process.stderr.write('fixture diagnostic');
}
`);
  await chmod(path.join(bin, "pi"), 0o700);
  const directories = [];
  const calls = [];
  let activeWorkers = 0;
  let peakWorkers = 0;
  const tools = {
    async bash(args) {
      calls.push(args);
      const worker = args.command.includes("timeout --kill-after");
      if (worker) peakWorkers = Math.max(peakWorkers, ++activeWorkers);
      try {
        let result;
        try {
          const out = await exec("bash", ["-c", args.command], {
            env: {...process.env, PATH: bin + ":" + process.env.PATH},
            timeout: args.timeout * 1000
          });
          result = {output: out.stdout + out.stderr, exit_code: 0};
        } catch (error) {
          if (typeof error.code !== "number") throw error;
          result = {output: error.stdout + error.stderr, exit_code: error.code};
        }
        if (args.command.startsWith("mktemp") && result.exit_code === 0) {
          directories.push(result.output.trim());
        }
        return result;
      } finally {
        if (worker) activeWorkers--;
      }
    },
    async write({path: target, content}) {
      await writeFile(target, content);
      return "written";
    }
  };
  t.after(async () => {
    await Promise.all([...directories, root].map(dir => rm(dir, {recursive: true, force: true})));
  });
  return {
    cwd, tools, calls,
    get peakWorkers() { return peakWorkers; },
    job: (task, extra = {}) => ({cwd, model: "example/model:low", task, ...extra}),
    async run(jobs, overrides = {}) {
      let result;
      await runTemplate(jobs, {...tools, ...overrides}, value => { result = value; });
      return result;
    }
  };
}

test("package exposes only the delegate skill", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  assert.deepEqual(pkg.pi, {skills: ["./skills"]});
  const skill = await readFile(new URL("../skills/delegate/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /^---\nname: delegate\ndescription: .+\n/);
  assert.match(skill, /Read `dispatch\.js`/);
  assert.doesNotMatch(source, /\b(import|require)\s*\(/);
});

test("a fresh worker receives exact input and returns only artifact paths", async t => {
  const f = await fixture(t);
  const task = "Quote ' $HOME $(exit 9)\nUnicode: 证据";
  const model = "example/model'$(exit 8):low";
  const [result] = await f.run([f.job(task, {model})]);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(await readFile(result.task, "utf8"), task);
  assert.match(await readFile(result.result, "utf8"), /Fixture report/);
  assert.equal(await readFile(result.stderr, "utf8"), "fixture diagnostic");
  assert.doesNotMatch(JSON.stringify(result), /Fixture report|fixture diagnostic/);
  const {args, cwd} = JSON.parse(await readFile(path.join(path.dirname(result.task), "args.json")));
  assert.equal(cwd, f.cwd);
  assert.equal(args[args.indexOf("--model") + 1], model);
  assert.ok(args.includes("--no-session"));
  assert.ok(args.includes("--print"));
  assert.ok(!args.includes("--continue"));
  assert.match(args[args.indexOf("--append-system-prompt") + 1], /leaf worker/);
  assert.equal(f.calls.at(-1).timeout, 630);
});

test("two workers run concurrently and one failure does not hide the other", async t => {
  const f = await fixture(t);
  const results = await f.run([f.job("FAIL"), f.job("OK")]);
  assert.deepEqual(results.map(r => r.status), ["failed", "completed"]);
  assert.equal(results[0].exitCode, 7);
  assert.equal(await readFile(results[0].result, "utf8"), "partial report");
  assert.equal(await readFile(results[0].stderr, "utf8"), "fixture failure");
  assert.notEqual(path.dirname(results[0].task), path.dirname(results[1].task));
  assert.equal(f.peakWorkers, 2);
});

test("empty output is a failure even when Pi exits zero", async t => {
  const f = await fixture(t);
  const [result] = await f.run([f.job("EMPTY")]);
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 65);
  assert.match(await readFile(result.stderr, "utf8"), /no report/);
});

test("invalid cwd produces a failure with a diagnostic file", async t => {
  const f = await fixture(t);
  const [result] = await f.run([f.job("OK", {cwd: f.cwd + "/missing"})]);
  assert.equal(result.status, "failed");
  assert.match(await readFile(result.stderr, "utf8"), /No such file/);
});

test("timeout ends the worker and its ordinary child process", async t => {
  const f = await fixture(t);
  const [result] = await f.run([f.job("SLOW", {timeoutSeconds: 1})]);
  assert.equal(result.status, "timed_out");
  assert.equal(result.exitCode, 124);
  await new Promise(resolve => setTimeout(resolve, 2600));
  await assert.rejects(access(path.join(path.dirname(result.task), "orphan-marker")));
});

test("tool failures retain the task directory for inspection", async t => {
  const f = await fixture(t);
  const [result] = await f.run([f.job("OK")], {write: async () => { throw new Error("write failed"); }});
  assert.equal(result.status, "tool_error");
  assert.match(result.directory, /^\/tmp\/pi-delegate\./);
  assert.match(result.error, /write failed/);
});

test("invalid batches are rejected before any tool call", async t => {
  const f = await fixture(t);
  for (const jobs of [[], [f.job("a"), f.job("b"), f.job("c")],
    [f.job("")], [f.job("x", {cwd: "relative"})],
    [f.job("x", {model: "no-provider"})], [f.job("x", {timeoutSeconds: 0})],
    [f.job("x", {timeoutSeconds: 1801})], [f.job("x", {timeoutSeconds: 1.5})],
    [f.job("x\0y")], [null]]) {
    await assert.rejects(f.run(jobs));
  }
  assert.equal(f.calls.length, 0);
});
