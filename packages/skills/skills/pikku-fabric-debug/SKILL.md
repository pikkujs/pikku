---
name: pikku-fabric-debug
description: 'Debug a deployed Fabric stage from the CLI — read logs, find recent errors, follow a single request end-to-end by traceId, and check request/error/latency metrics. TRIGGER when: a deployed Fabric app is erroring, timing out, or behaving differently than local; the user asks "why is prod failing", "check the logs", "what happened to this request"; or a deploy succeeded but the app misbehaves. DO NOT TRIGGER when: the failure reproduces locally (debug it locally), the deploy itself failed (use pikku-fabric — that is a build/config problem, not a runtime one), or the project is not deployed to Fabric.'
installGroups: [fabric]
---

# Debugging a deployed Fabric stage

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Reproduce locally first. If it fails locally too, debug it there — the
   deployed stage adds cost and latency to every iteration.
2. Start from `errors`, not `logs`. Errors are already filtered and carry the
   traceId that unlocks the rest.
3. Follow one trace end-to-end before forming a theory. A single failing request
   tells you more than a hundred unrelated log lines.
4. Fix the source cause and redeploy. Never leave the diagnosis at "it is flaky".
5. Confirm the fix against the same stage — recheck `errors` for the function.

Every command below requires a logged-in CLI and a linked project. Both fail
with the exact remediation if not:

```
Not logged in. Run `pikku fabric login` first.
No fabric project linked. Run `pikku fabric link` first.
```

## The loop

**1 — What is broken?**

```bash
pikku fabric errors -b main                 # branch defaults to main
pikku fabric errors -b main --function createOrder
```

Prints a `WHEN | FUNCTION | TRACE | MESSAGE` table. The message is **truncated
to 100 characters** — treat it as a label, not the full error. The TRACE column
is the input to the next step.

**2 — What happened in that one request?**

```bash
pikku fabric trace <traceId> -b main
pikku fabric trace <traceId> -b main --json
```

`--branch` is **required** here (no default). Each event prints as:

```
<timestamp> <scriptName> <wireType>:<wireId> <duration>ms — <error|message|outcome>
```

This is the whole request across the stage — every unit it touched, in order,
with per-event durations. The last event before the failure is where to look.

**3 — Is it one request or the whole stage?**

```bash
pikku fabric metrics -b main                       # last 24h
pikku fabric metrics -b main --hours 2 --function createOrder
```

Rows are `reqs= err= (rate%) avg= min= max=` per bucket. A single bad request
with a healthy error rate is a data problem; a climbing error rate is a
deployment or dependency problem. `--json` additionally returns a `wireTypes`
breakdown (requests per http/queue/scheduler/…) that the table output omits.

**4 — Wider context around the failure**

```bash
pikku fabric logs -b main
pikku fabric logs -b main --level warn
pikku fabric logs -b main -f              # follow
```

`--branch` is **required** — `logs` throws `Specify --branch <branch-name>.`
without it, even though the flag reads as optional.

**5 — Is the running code the code you think it is?**

```bash
pikku fabric status     # active + in-flight deployment, per stage, with gitSha
```

Check this *before* deep-diving. A stage still serving an older `gitSha`, or a
deploy stuck in flight, explains a whole class of "my fix did nothing".

## Known gaps — do not misread these as bugs in your app

- **`pikku fabric logs --since` and `--deployment` are accepted and ignored.**
  They are declared as options but the command never reads them, so
  `--since 15m` silently returns the same default window as no flag at all. Do
  not conclude "nothing happened in the last 15 minutes" from it. Narrow by
  `--level`, or by `--function` via `errors`, instead.
- **`--follow` is a 2-second client-side poll, not a server stream.** It
  dedups against what it already printed, so it behaves like `tail -f`, but new
  entries can appear up to ~2s late and it holds the process open until killed.

## What NOT to do

- **Do not SSH anywhere or query the telemetry backend directly.** These
  commands are the supported surface; anything lower-level is Fabric-internal
  and will not exist for your project.
- **Do not debug by redeploying with added `console.log`s.** Get the traceId,
  read the trace. A deploy cycle per hypothesis is the slow path.
- **Do not read the truncated `errors` message as the full error.** Always
  confirm against `trace` before changing code.
- **Do not treat an empty `errors` table as "the app is fine"** — a request that
  returns a wrong 200 logs nothing. Check `metrics` for the outcome mix.
