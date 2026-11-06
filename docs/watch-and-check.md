# Watching and checking

`pikku watch` and `pikku dev` keep the project's generated code and type check
current. `pikku check` reports the result, so a human or an agent can ask whether
the project is sound without running `pikku all` and `tsc` again.

## What the watcher does

After a change it runs:

1. `pikku all`, when a file in `srcDirectories` or the email templates changed.
2. Each frontend's message compile, when one of its `messages/*.json` files
   changed and at startup. This is the frontend's own `paraglide` or
   `i18n:compile` script, the step its `tsc` script runs first.
3. A type check of the backend and every frontend.

A frontend edit skips step 1. The projects are the ones `pikku verify` covers.

The type checker runs in its own process and stays warm: it holds the program in
memory and only checks what a change affected. It starts with the first run, uses
the project's own `typescript`, and exits with the watcher. If it dies, the run is
reported as failed and the next run starts a new one.

A change during a run discards that run's result and starts another, so the
status always describes the latest files.

## `.pikku/status.json`

Replaced atomically, so it is always a whole file.

| Field         | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| `state`       | `running`, `ok` or `failed`                                                        |
| `stage`       | While running: `queued`, `codegen`, `messages` or `typecheck`                      |
| `generation`  | Counts runs since the watcher started                                              |
| `sourcesAt`   | The result covers edits up to this time                                            |
| `diagnostics` | `severity`, `code`, `message`, and `project`, `file`, `line`, `column` where known |
| `typecheck`   | `durationMs` and `rssBytes` of the warm checker                                    |
| `pid`         | The watcher, so a status left by a dead one is ignored                             |

## `pikku check`

```
pikku check            # prints a short result, exits 0 or 1
pikku check --json     # the full result as one JSON line
pikku check --timeout 30
```

| Situation                                     | What it does                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Watcher finished, nothing newer               | Returns at once, doing no compile work                                                                                     |
| Watcher running                               | Waits for it                                                                                                               |
| A file is newer than the result               | Waits for the watcher, and wakes it with `SIGUSR2` if it sits idle behind the file                                         |
| Still waiting after `--timeout` (120 seconds) | Exits 1 naming the stage: `queued`, `codegen`, `messages`, `typecheck`, or `waiting` if the watcher never noticed the file |

The watcher does not trust file events alone. After each run it looks again for files newer than the run's start, and runs again if it finds any, so an idle watcher does not sit behind its own files. It does this at most five times in a row, each after the debounce, and then publishes the result it has, so a file that changes behind each run cannot keep it busy. While files keep changing faster than the debounce the watcher does no work and `pikku check` fails at `--timeout` with the file it saw last, then answers normally once the writing stops.
| No watcher running | One full `pikku all`, message compile and `tsc`, under the same limit |

Watched files are those in `srcDirectories`, the email templates and each
frontend's directory. Anything else a project compiles, such as a shared workspace
package, is not watched, and neither are the root `tsconfig.json` and
`pikku.config.json`. A frontend's `tsconfig.json` is.

## When codegen fails

`pikku check` reports each error of the failed run, causes first with their file where known, and what the run finally threw last. There are no stack frames, one bad import across many schemas is one entry, and the text output is at most 30 lines, so `pikku check 2>&1 | tail -30` shows the cause. `--json` has every diagnostic.

## Undoing a change

`pikku all` empties `pikku-variables.gen.ts` or `pikku-secrets.gen.ts` before it starts if either imports a name or file the project no longer has, then writes them in full in the same run. Without this, removing a variable fails every Zod schema, because reading a schema loads those files. Imports from packages rather than relative paths are not checked.

## Two runs at once

Only one `pikku all` runs per output directory: a second one waits up to five minutes for the first, and takes over at once if the first has died.

## Route trees

`routeTree.gen.ts` is generated and gitignored, and normally only a running Vite writes it. So the watcher and the full run generate it before the type check, in a stage named `routes`, at startup and when anything under the routes directory changes. This applies to a frontend with a routes directory and TanStack Router tooling. A `routes` or `generate:routes` script wins; otherwise the project's own `@tanstack/router-generator` runs, honouring `tsr.config.json` and TanStack Start's footer. The output matches what the Vite plugin writes, and an unchanged tree is not rewritten, so a running `vite dev` sees nothing. Options passed to `tanstackStart({ router })` in `vite.config.ts` are not read: put them in `tsr.config.json`, or add a `routes` script.
