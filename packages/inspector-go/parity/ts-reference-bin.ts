#!/usr/bin/env node
// `pikku-inspect --stdin`, answered by the TypeScript engine. Point
// PIKKU_INSPECTOR_GO_BIN here to run the Go wrapper or the parity harness end
// to end without Go.
//
// PIKKU_TS_REFERENCE_FINALIZE=1 finalizes, as the real binary always does, for
// the wrapper (which no longer finalizes); without it the output is the
// analysis-only state the parity harness compares before finalize.
//
// For the harness's own tests it can also misbehave on request:
//   PIKKU_TS_REFERENCE_DROP=a,b       leave those state sections out
//   PIKKU_TS_REFERENCE_REORDER=1      print customTypes the other way round,
//                                     as tsgo orders unions and properties
//   PIKKU_TS_REFERENCE_EXTRA_WARN=m   add a warning the reference never gave
import { analyzeWithTypeScript } from './ts-reference.ts'
import { reorderTypeString } from './normalize.ts'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk)
const output = await analyzeWithTypeScript(
  JSON.parse(Buffer.concat(chunks).toString('utf8')),
  { finalize: !!process.env.PIKKU_TS_REFERENCE_FINALIZE }
)

const state = output.state as unknown as Record<string, any>
for (const section of process.env.PIKKU_TS_REFERENCE_DROP?.split(',') ?? []) {
  delete state[section]
}
if (process.env.PIKKU_TS_REFERENCE_REORDER) {
  for (const entry of state.functions?.typesMap?.customTypes ?? []) {
    entry[1] = { ...entry[1], type: reorderTypeString(entry[1].type, -1) }
  }
}
if (process.env.PIKKU_TS_REFERENCE_EXTRA_WARN) {
  output.diagnostics.push({
    level: 'warn',
    message: process.env.PIKKU_TS_REFERENCE_EXTRA_WARN,
  })
}
process.stdout.write(JSON.stringify(output))
