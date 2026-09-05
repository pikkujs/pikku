/**
 * Heap probe preloaded into the `pikku all` child by bench-codegen-perf.ts
 * (via `NODE_OPTIONS=--expose-gc --require`). Writes, on exit, a JSON report
 * to $PIKKU_HEAP_PROBE_OUT:
 *
 *   {
 *     programs: [{ index, kind, caller, atMs, liveMb }], // one per ts.Program
 *     peakMb,                                      // highest used heap seen
 *   }
 *
 * A program is detected by the read of TypeScript's default lib: neither the
 * inspector nor ts-json-schema-generator shares a compiler host, so every
 * `ts.createProgram` reads lib.es5.d.ts exactly once. `liveMb` is the used
 * heap after a forced full GC at that moment — only what is still reachable.
 * That is the number that grows when a finished inspector pass keeps its
 * program alive (its `typesLookup` holds ts.Types, which reach the checker,
 * which reaches the program): the next pass then starts one whole program +
 * checker higher than the first one did. `kind` tells the inspector's own
 * programs apart from the small one ts-json-schema-generator builds.
 */
const fs = require('node:fs')
const v8 = require('node:v8')

const usedMb = () => Math.round(v8.getHeapStatistics().used_heap_size / 1048576)

const programs = []
let peakMb = 0
const sample = () => {
  peakMb = Math.max(peakMb, usedMb())
}
// Coarse: the event loop is blocked while a program parses, so most of the
// peak comes from the samples taken at each program start and on exit.
setInterval(sample, 25).unref()

// The first frame above TypeScript itself: who asked for this program.
const callerOf = () => {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 400
  const frames = (new Error().stack ?? '').split('\n').slice(1)
  Error.stackTraceLimit = limit
  const frame = frames.find(
    (f) => !f.includes('/typescript/') && !f.includes(__filename)
  )
  return frame ? frame.trim().replace(/^at\s+/, '') : '?'
}

const kindOf = (caller) =>
  caller.includes('ts-json-schema-generator')
    ? 'schema'
    : caller.includes('/inspector/')
      ? 'inspector'
      : 'other'

const readFileSync = fs.readFileSync
fs.readFileSync = function (path, ...rest) {
  if (typeof path === 'string' && path.endsWith('lib.es5.d.ts')) {
    sample()
    if (typeof globalThis.gc === 'function') globalThis.gc()
    const caller = callerOf()
    programs.push({
      index: programs.length + 1,
      kind: kindOf(caller),
      caller,
      atMs: Math.round(performance.now()),
      liveMb: usedMb(),
    })
  }
  return readFileSync.call(this, path, ...rest)
}

process.on('exit', () => {
  sample()
  const out = process.env.PIKKU_HEAP_PROBE_OUT
  if (out) fs.writeFileSync(out, JSON.stringify({ programs, peakMb }))
})
