# pi-delegate

An on-demand delegation skill for Pi. Keep normal work in the main agent. Use fresh Pi processes for bounded, independent tasks.

This package contains one skill and a codemode template. It adds no extension, tool, background service, or npm dependency.

## Requirements

- Pi with `codemode`, `bash`, `write`, and `read` available to the main agent.
- An available model that Pi identifies as using subscription access.
- Linux with Bash and GNU `timeout`.
- Node.js 22 or later for the subscription check and tests.
- An npm or managed Pi installation whose SDK can be resolved from the Pi executable.

The workflow targets the Pi 1.4.0 CLI and codemode interfaces. macOS and Windows are not supported by this version.

## Install

From GitHub:

```sh
pi install git:github.com/henrywen98/pi-delegate
```

For local development, run this command from the package directory:

```sh
pi install .
```

Choose one installation source. A local installation loads the checkout directly; commit and push changes to keep GitHub in sync.

Run `/reload` in an existing Pi session. New sessions discover the skill automatically.

If codemode is not available, enable it for one session with `pi --tools +codemode`.

## Use

Ask Pi to delegate a bounded investigation, or invoke the skill explicitly:

```text
/skill:delegate Investigate these two independent questions and compare the evidence.
```

Pi prepares the task inputs and runs the bundled template through codemode. You do not run `dispatch.js` with Node.

```text
Main Pi → codemode → bash → pi --print → temporary files → Main Pi
```

Each worker gets a fresh, nonpersistent conversation. It returns a Markdown report. At most two workers run in each batch.

The main agent waits for the batch. It receives status and file paths, then reads and checks the reports before answering.

## Files and failure handling

Each task gets a unique `/tmp/pi-delegate.*` directory containing:

| File | Contents |
| --- | --- |
| `task.md` | Explicit task and selected context |
| `result.md` | Final worker response, or partial output on failure |
| `stderr.log` | Process diagnostics |

A subscription check runs before each worker, with a separate 30-second deadline. It makes no model calls.

The default worker deadline is 10 minutes. A task can set a deadline from 1 second to 30 minutes.

Failures remain visible alongside successful results. Empty output is a failure. Successful execution still requires the main agent to check task completion.

Task files stay available for inspection. Remove them when no longer needed. Move durable findings to the normal document location.

## Boundaries

This package provides conversation isolation, not a security sandbox. Workers use normal Pi configuration, project context, credentials, and resource discovery.

A worker does not inherit the parent conversation, active model selection, or temporary tool state. The caller selects an exact model explicitly.

The preflight requires an available model and `ModelRuntime.isUsingSubscription(providerId) === true`. False, unknown, or failed checks block launch without fallback. It checks standard Pi credentials and configuration, not extension-only provider registrations.

This is a startup check, not a process-wide billing firewall. Later credential changes, extension overrides, and direct model calls need their own checks. Worker instructions require subscription access for additional calls and prohibit changing the selected model or authentication.

Pi's subscription marker does not guarantee zero extra charges or remaining quota. API-key plans without that marker remain blocked.

Read-only work and leaf-only execution are prompt instructions, not enforced permissions. Configure restricted tools separately when a task requires that boundary.

The template does not resolve tool or instruction conflicts automatically. It does not provide background execution, live progress, automatic retries, or combined usage accounting.

GNU timeout terminates ordinary worker process groups. Detached processes and arbitrary extension behavior are outside this workflow. Interrupted calls require a process check before retrying.

## Tests

```sh
npm test
```

Tests execute the actual codemode template with fake Pi processes. They cover subscription checks, parallel execution, quoting, artifacts, failure, empty output, input validation, and timeout cleanup.

Real-model checks require a configured Pi login and incur model usage. Run them with synthetic inputs outside this repository; keep results and session logs local.
