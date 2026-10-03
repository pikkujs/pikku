// pi extension: attach pikku codegen diagnostics to the edit that caused them.
//
// Loaded via `pi -e containers/sandbox/pi/codegen-diagnostics.mjs` (see pi-drive.ts).
// The sibling of pi-lsp, covering the half a language server structurally cannot:
// tsserver reports TYPE errors, and pikku's PKU diagnostics are CODEGEN errors — a
// missing permission gate, an unresolvable schema, a wire that generates nothing. No
// language server will ever produce one.
//
// Why it exists at all. `pikku dev` re-runs the same `runAllWithCommandState()` codegen
// on every file change (chokidar, see the CLI's dev command), so by the time the agent
// asks `pikku all` the answer has already been computed once. Measured on
// build-1786388323091: 8 `pikku all` calls, ~6.6s of tool time each, but the real
// cost is the ROUND TRIP — ~6.5s of model latency per call, ~52s of a 1051s build spent
// asking a question the dev server had already answered.
//
// Worse than slow, it is silent. `getPikkuDevErrorSummary` deliberately reports nothing
// for a RUNNING server, and a server whose codegen failed IS running — serving the
// previous generation. Types and schemas go stale, every call validates against the old
// shape, and no command says so unless the agent thinks to run one.
//
// NEVER BLOCKS, and that is the whole design. pi-lsp sleeps `diagnosticsWaitMs` (1500ms)
// after every write to let the server settle; across the 55 edit+write calls of that
// same build that is up to 82s added to save ~40s. So this reads whatever the dev server
// has ALREADY written and returns immediately. The agent spends ~6.5s thinking between
// tool calls and codegen takes ~2.1s, so a pass normally lands before the next edit —
// diagnostics arrive one edit late and cost nothing. Deliberately trading latency for
// freshness, because the latency is what the round-trip budget cannot afford.
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = /\.(ts|tsx)$/

/** Codegen's own verdicts. `error TS` is left to pi-lsp, which reports it per file. */
const DIAGNOSTIC = /\[PKU\d+\]|pikku all failed|Error generating schema/

/** Bounded: a dev log grows for the life of the build and this runs in a tool hook. */
const TAIL_BYTES = 64 * 1024

const devLogPath = () =>
  process.env.PIKKU_DEV_LOG ??
  join(process.cwd(), '.pikku-dev.log')

/** The log's size now, or 0 when there is no log yet (the dev server starts later). */
function currentSize() {
  try {
    return statSync(devLogPath()).size
  } catch {
    return 0
  }
}

/**
 * Diagnostics written to the dev log since the last call, or null when there are none.
 *
 * Offset-tracked rather than content-diffed so a failure that persists across several
 * edits is reported ONCE, when it appears. Re-attaching the same PKU error to every
 * subsequent edit would train the agent to ignore the channel, which is the failure mode
 * this is meant to prevent — and it is how a build ends up stripping a real permission to
 * satisfy a diagnostic it has stopped reading.
 */
function diagnosticsSince(state) {
  const file = devLogPath()
  let size
  try {
    size = statSync(file).size
  } catch {
    return null // no dev server in this run — nothing to report, and not an error
  }
  // Truncated or rotated: restart from the end rather than replaying the whole file as
  // if it were new.
  if (size < state.offset) {
    state.offset = size
    return null
  }
  if (size === state.offset) return null

  // A positional read, not readFileSync + slice: the dev log accumulates for the whole
  // build, and pulling megabytes into memory to keep the last 64KB would put the cost
  // back into a hook whose entire purpose is to be free.
  let text
  const from = Math.max(state.offset, size - TAIL_BYTES)
  let fd = null
  try {
    fd = openSync(file, 'r')
    const buffer = Buffer.alloc(size - from)
    const read = readSync(fd, buffer, 0, buffer.length, from)
    text = buffer.subarray(0, read).toString('utf-8')
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
  state.offset = size

  // Deduped by CONTENT and across the whole session, not by log position. `pikku dev`
  // re-runs codegen on every file change and every pass re-emits the same diagnostics as
  // fresh bytes, so offset-tracking alone reports an unchanged error once per edit —
  // measured on run 13, which attached the identical PKU952 to three consecutive edits.
  // Repeating an error the agent has already been told about is how this channel becomes
  // noise, and a channel the agent has learned to skim is worse than no channel.
  const fresh = []
  for (const line of text.split('\n')) {
    if (!DIAGNOSTIC.test(line)) continue
    const normalized = line.replace(/\s+/g, ' ').trim()
    if (state.seen.has(normalized)) continue
    state.seen.add(normalized)
    fresh.push(normalized)
  }
  return fresh.length > 0 ? fresh.slice(0, 8) : null
}

export default function (pi) {
  // Start at the END of the log, not at zero. The dev server boots before the agent does
  // and its first `pikku all` reports whatever the TEMPLATE already carries — measured on
  // run 12, the first edit came back annotated with a PKU952 in
  // `src/scaffold/console/console.gen.ts`, generated scaffold the agent never wrote and
  // must not touch. Blaming an edit for a diagnostic that predates the build is how an
  // agent talks itself into "fixing" generated code, which is the exact spiral this
  // channel exists to prevent.
  const state = { offset: currentSize(), seen: new Set() }

  pi.on('tool_result', (event) => {
    if (event.toolName !== 'edit' && event.toolName !== 'write') return undefined
    if (event.isError) return undefined
    const path =
      event.input?.path ?? event.input?.file_path ?? event.input?.filePath ?? event.input?.filename
    if (typeof path !== 'string' || !SOURCE.test(path)) return undefined

    const found = diagnosticsSince(state)
    if (!found) return undefined

    const summary =
      `pikku codegen reported this after a recent change — the dev server re-ran ` +
      `codegen on its own, so this is FREE and you do not need \`pikku all\` to see ` +
      `it:\n\n${found.map((l) => `  ${l}`).join('\n')}\n\n` +
      `It may name an edit slightly earlier than this one (codegen runs just behind you). ` +
      `Fix it with the rest of your current batch, then verify ONCE at the end.`

    return { content: [...event.content, { type: 'text', text: summary }] }
  })
}
