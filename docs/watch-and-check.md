# Watching and checking

`pikku watch` and `pikku dev` keep the project's generated code and type check
current. `pikku check` reports the result, so a human or an agent can ask whether
the project is sound without running `pikku all` and `tsc` again.

## What the watcher does

After a change it runs:

1. `pikku all`, when a file in `srcDirectories` or the email templates changed.
2. A type check of the backend and every frontend.

A frontend edit skips step 1. The projects are the ones `pikku verify` covers.

The type checker runs in its own process and stays warm: it holds the program in
memory and only checks what a change affected. It starts with the first run, uses
the project's own `typescript`, and exits with the watcher. If it dies, the run is
reported as failed and the next run starts a new one.

A change during a run discards that run's result and starts another, so the
status always describes the latest files.

## `.pikku/status.json`

Replaced atomically, so it is always a whole file.

| Field | Meaning |
| --- | --- |
| `state` | `running`, `ok` or `failed` |
| `stage` | While running: `queued`, `codegen` or `typecheck` |
| `generation` | Counts runs since the watcher started |
| `sourcesAt` | The result covers edits up to this time |
| `diagnostics` | `severity`, `code`, `message`, and `project`, `file`, `line`, `column` where known |
| `typecheck` | `durationMs` and `rssBytes` of the warm checker |
| `pid` | The watcher, so a status left by a dead one is ignored |

## `pikku check`

```
pikku check            # prints a short result, exits 0 or 1
pikku check --json     # the full result as one JSON line
pikku check --timeout 30
```

| Situation | What it does |
| --- | --- |
| Watcher finished, nothing newer | Returns at once, doing no compile work |
| Watcher running | Waits for it |
| A file is newer than the result | Waits for the watcher to pick it up |
| Still waiting after `--timeout` (120 seconds) | Exits 1 naming the stage: `queued`, `codegen`, `typecheck`, or `waiting` if the watcher never noticed the file |
| No watcher running | One full `pikku all` plus `tsc`, under the same limit |

Changes to `tsconfig.json` in the backend root and to `pikku.config.json` are not
watched. A frontend's `tsconfig.json` is.
