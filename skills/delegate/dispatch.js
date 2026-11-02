// Codemode template: declare `jobs` before this script. No imports or Node APIs.
if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 2) {
  throw new Error("Provide one or two independent jobs.");
}
for (const job of jobs) {
  if (!job || typeof job.cwd !== "string" || !job.cwd.startsWith("/") ||
      typeof job.model !== "string" || !job.model.includes("/") ||
      typeof job.task !== "string" || !job.task.trim() ||
      [job.cwd, job.model, job.task].some(value => value.includes("\0"))) {
    throw new Error("Each job needs an absolute cwd, provider/model, and nonempty task.");
  }
  const seconds = job.timeoutSeconds ?? 600;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) {
    throw new Error("timeoutSeconds must be an integer from 1 to 1800.");
  }
}
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
// Runs in Node through bash, not in the codemode VM. It never calls a model.
const subscriptionCheck = String.raw`
import {readFileSync, realpathSync} from "node:fs";
import {dirname, join} from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
try {
  const executable = realpathSync(process.argv[1]);
  const packageName = "@earendil-works/pi-coding-agent";
  let entry;
  try {
    entry = createRequire(executable).resolve(packageName);
  } catch {
    const root = join(dirname(executable), "..", "install");
    const version = readFileSync(join(root, "current-version"), "utf8").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version)) throw new Error("Invalid Pi version");
    entry = join(root, "releases", version, "node_modules", packageName, "dist", "index.js");
  }
  const {ModelRuntime} = await import(pathToFileURL(entry).href);
  const runtime = await ModelRuntime.create({allowModelNetwork: false});
  const selection = process.argv[2].replace(/:(off|minimal|low|medium|high|xhigh|max)$/, "");
  const slash = selection.indexOf("/");
  const provider = selection.slice(0, slash);
  const id = selection.slice(slash + 1);
  const model = runtime.getModel(provider, id);
  const available = runtime.getAvailableSnapshot().some(m => m.provider === provider && m.id === id);
  if (!model || !available || runtime.isUsingSubscription(provider) !== true) {
    throw new Error("Subscription access is not confirmed");
  }
} catch {
  console.error("Subscription check failed: exact available model and confirmed subscription access are required. Worker not started.");
  process.exitCode = 78;
}
`;
const workerRules = [
  "Complete only this delegated task using the supplied context and applicable project rules.",
  "Work as a leaf worker: do not start other agents or delegate tasks.",
  "Use only Pi-confirmed subscription access for any additional model calls. If verification is unavailable, skip the call and report the gap.",
  "Keep the selected model and authentication unchanged. Do not fall back to another billing channel.",
  "Use read-only research. Do not modify project files or external business data.",
  "Return missing information as uncertainty instead of asking interactive questions.",
  "Return Markdown with: Summary; Evidence and sources; Uncertainty and incomplete work.",
  "Put the short summary first. Connect material claims to file locations or source URLs.",
  "Include the check date for time-sensitive research. Return the report as your final response."
].join("\n");
const outcomes = await Promise.allSettled(jobs.map(async (job, index) => {
  let directory;
  try {
    const created = await tools.bash({
      command: "mktemp -d /tmp/pi-delegate.XXXXXXXX",
      timeout: 10
    });
    if (created.exit_code !== 0) throw new Error("Could not create a task directory.");
    directory = created.output.trim();
    if (!/^\/tmp\/pi-delegate\.[A-Za-z0-9]+$/.test(directory)) {
      throw new Error("Unexpected temporary directory path.");
    }
    const task = directory + "/task.md";
    const result = directory + "/result.md";
    const stderr = directory + "/stderr.log";
    await tools.write({path: task, content: job.task});
    const seconds = job.timeoutSeconds ?? 600;
    const args = [
      "pi", "--print", "--no-session", "--model", job.model,
      "--append-system-prompt", workerRules, "@" + task
    ].map(quote).join(" ");
    const check = `timeout --kill-after=5s 30s node --input-type=module -e ${quote(subscriptionCheck)} "$(command -v pi)" ${quote(job.model)}`;
    const execution = await tools.bash({
      command: `(cd -- ${quote(job.cwd)} && ${check} && timeout --kill-after=5s ${seconds}s ${args}) < /dev/null > ${quote(result)} 2> ${quote(stderr)}\ncode=$?\nif [ "$code" -eq 0 ] && [ ! -s ${quote(result)} ]; then printf '%s\\n' 'Worker returned no report.' >> ${quote(stderr)}; code=65; fi\nexit "$code"`,
      timeout: seconds + 65
    });
    return {
      index,
      status: execution.exit_code === 0 ? "completed" :
        execution.exit_code === 124 ? "timed_out" : "failed",
      exitCode: execution.exit_code,
      task, result, stderr
    };
  } catch (error) {
    return {index, status: "tool_error", directory, error: String(error)};
  }
}));
text(outcomes.map((outcome, index) => outcome.status === "fulfilled"
  ? outcome.value
  : {index, status: "tool_error", error: String(outcome.reason)}));
