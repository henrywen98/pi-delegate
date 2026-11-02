---
name: delegate
description: Delegate a bounded task to a fresh Pi context when it has bulky intermediate evidence, can run independently in parallel, or explicitly needs a subagent. Keep tightly coupled reasoning in the main agent; use parallel tool calls for simple lookups.
compatibility: Pi with codemode, bash, write, and read; Linux with GNU timeout and a configured Pi CLI.
---

# Delegate

## Decide and prepare

Keep the main agent responsible for the final answer. Delegate only when you can state the independent question, the benefit of isolation, and the completion condition.

Use one worker for isolation. Use at most two workers per batch for independent tasks. Run later batches only if still needed. Workers return evidence; the main agent performs any authorized business actions.

Each task must include:

- The question, necessary background, and completion condition.
- Absolute input paths or source URLs, and the allowed research scope.
- Applicable task-specific instructions that the worker cannot discover from its working directory.
- Any limits on tools, external access, and local file access.
- Output language and evidence requirements.

Pass selected context, not the whole parent transcript. A worker cannot ask the main agent questions during execution. Missing information belongs in its result.

## Dispatch

Read `dispatch.js` beside this file before dispatching. It is a codemode template, not a Node program or an additional tool.

Prepare a `jobs` array, then paste the template after it in one codemode call:

```js
const jobs = [{
  cwd: "/absolute/project/path",
  model: "provider/model-id:medium",
  task: "An independent question, necessary context, sources, and completion condition.",
  timeoutSeconds: 600
}];
// Paste dispatch.js here.
```

Use an available, authenticated model. Specify the provider and model explicitly; include a supported thinking suffix when needed. Use the current model when its full identity is known. Otherwise inspect Pi configuration or available models instead of guessing.

Choose a working directory whose context files apply to the task. Workers use normal Pi resource discovery and credentials. They do not inherit the parent's conversation, active model selection, or temporary tool state. Parent-only tools might be unavailable in a child.

The template isolates conversation history, not tools, instructions, or filesystem access. If the task requires a different tool or instruction set, stop and define that configuration before dispatching. This template does not resolve such conflicts automatically.

Wait for the codemode call to finish. Leave its script deadline unset, or allow enough time for the worker deadline and cleanup. Do not launch detached jobs. The template returns only process status and artifact paths, not worker output.

## Review and finish

Read each successful `result` file, starting with its summary. A zero exit code and nonempty file prove process completion, not task completion.

Compare every result against the task's completion condition. Check sources behind material claims. Read more evidence where needed, resolve conflicts, and form the final answer yourself.

For failure or timeout, read `stderr` and any partial `result`. Treat partial output as incomplete. Decide whether to narrow the task, supply missing context, retry once, or continue in the main agent. Report remaining gaps; do not silently treat failure as success.

If the outer tool call is interrupted, do not assume all descendants have exited. Check for remaining task processes before retrying. GNU timeout bounds ordinary worker execution; detached processes are outside this workflow.

Keep useful findings in the user's normal document location when requested. Temporary directories are scratch space, not durable handoff records. Remove only task directories that are no longer needed.
