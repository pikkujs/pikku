# CLI output probe

Captures every screen a pikku CLI can print, and what each one costs, then
renders them into a single self-contained HTML report.

```bash
# from any pikku project root (here, packages/cli)
yarn cli-report          # in-process tiers only — ~2s
yarn cli-report:full     # adds spawned startup baselines — ~2min
```

Results land in `.pikku-cli-report/` (`PIKKU_REPORT_DIR` to move them):
`outputs.ndjson`, `timings.ndjson`, `summary.json`, and `report.html`.

## Why it doesn't have to run the CLI

A pikku CLI is self-wired, so every project generates
`<outDir>/cli/pikku-cli-wirings-meta.gen.json` — programs, commands,
subcommands, positionals, options. That inventory is the whole input, which is
what makes the probe generic rather than pikku-specific.

**Help and parse errors are pure functions of it.** `generateCommandHelp` and
`parseCLIArguments` from `@pikku/core/cli` take the meta and return text. No
process, no config, no services. `cli-runner.ts` returns help immediately after
parsing and only builds services much later, so these screens are reachable
with nothing running.

**Renderers register on import.** Importing the generated wiring populates
`pikkuState(null, 'cli', 'programs')[program].renderers` without executing a
single command. A renderer is a pure function of its payload, so handing it a
payload prints exactly what a user would see.

**Only two things genuinely need a process**: startup cost, and prompts. Those
spawn `node` — prompts under `force-tty.mjs`, an `--import` shim that marks the
three stdio streams as TTYs before any module loads, so readline takes its
interactive path without needing a pty.

## Synthesis, and being honest about it

Renderer payloads are built by walking each command's output JSON Schema:
strings get a token from the field name, enums their first member, `$ref` is
resolved, `anyOf`/`oneOf` picks a branch. Arrays are sized four ways — **0**
(the empty state), **2** (typical), **12** (does it paginate or truncate?), and
a pass with long strings for overflow.

Where a schema declares a field as bare `{}` there is nothing to synthesize
from. The probe records a **synthesis hole** and the linter then refuses to
blame the CLI for anything that throws on a payload it admits it invented —
those are reported as `schema.untyped-output` against the schema instead. This
matters: it is the difference between 4 real renderer bugs and 45 imagined
ones.

Every capture carries its provenance. `observed` is real output from the real
parser or a real process; `synthesized` is a real renderer on an invented
payload.

## Determinism

No network, no model, no AI. Run it twice and the captures are identical. The
only judgement in the pipeline is the lint rules in `render-report.mjs`, each a
hand-written predicate over the captures that you can read and disagree with.

Timings are min-of-N with the subjects shuffled per round — a fixed order lets
whichever subject runs first absorb the cold page cache, which was worth about
100ms of pure fiction.

## Files

| file | role |
| --- | --- |
| `probe.ts` | captures all tiers, writes the NDJSON results |
| `render-report.mjs` | lint rules + the HTML report, with ANSI rendered as real colour |
| `force-tty.mjs` | `--import` shim that makes stdio look like a terminal |
| `pty.mjs` | drives an interactive command, typing answers when output goes quiet |
| `prompt-driver.mjs` | captures the deploy confirmation prompt |
