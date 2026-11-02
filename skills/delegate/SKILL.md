---
name: delegate
description: Assess delegation when context bloat measurably degrades performance, independent investigations need parallel fresh contexts, or tool selection or instruction conflicts require isolation. Also handles explicit subagent requests. Keep ordinary work in the main agent.
compatibility: Pi with codemode, bash, write, and read; Linux with GNU timeout and a configured Pi CLI.
---

# Delegate

## Decide and prepare

Default to the main agent. First consider on-demand skill loading, tool search, and filtering or selectively reading results. Use parallel tool calls for simple lookups.

Consider autonomous delegation only when at least one condition applies:

- **Context degradation:** Context bloat has caused measurable performance loss. Identify the observed failure or measured regression; material volume alone is insufficient.
- **Independent parallel work:** Separate investigations need parallel execution in fresh contexts that can be discarded after completion.
- **Tool or instruction conflict:** The main agent struggles to select appropriate tools, or conflicting instructions require separate execution configurations.

These conditions justify consideration, not automatic dispatch. Keep tasks together when they need extensive shared history, repeated clarification, or continuing exchange of intermediate results.

For conflicts, specify which tools or instructions must differ. This template isolates conversation history, not tools, instructions, or filesystem access. It cannot provide that separate configuration. Stay in the main agent until a suitable configuration is available; starting an identical worker does not resolve the conflict.

Treat an explicit user request for subagents as authorization, not evidence of those technical conditions. Still check task independence and configuration suitability.

Before dispatch, state the independent question, why delegation is worthwhile, and the completion condition. If those are unclear, continue in the main agent. Keep the main agent responsible for the final answer.

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

Wait for the codemode call to finish. Leave its script deadline unset, or allow enough time for the worker deadline and cleanup. Do not launch detached jobs. The template returns only process status and artifact paths, not worker output.

## Review and finish

Read each successful `result` file, starting with its summary. A zero exit code and nonempty file prove process completion, not task completion.

Compare every result against the task's completion condition. Check sources behind material claims. Read more evidence where needed, resolve conflicts, and form the final answer yourself.

For failure or timeout, read `stderr` and any partial `result`. Treat partial output as incomplete. Decide whether to narrow the task, supply missing context, retry once, or continue in the main agent. Report remaining gaps; do not silently treat failure as success.

If the outer tool call is interrupted, do not assume all descendants have exited. Check for remaining task processes before retrying. GNU timeout bounds ordinary worker execution; detached processes are outside this workflow.

Keep useful findings in the user's normal document location when requested. Temporary directories are scratch space, not durable handoff records. Remove only task directories that are no longer needed.
