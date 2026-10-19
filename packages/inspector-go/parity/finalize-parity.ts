#!/usr/bin/env bun
/**
 * Parity of the Go finalize pass alone: the TypeScript reference's own
 * pre-finalize state is fed to `pikku-inspect finalize --stdin`, and the
 * result is compared with the reference's post-finalize state, so analysis
 * differences cannot leak in.
 *
 *   bun parity/finalize-parity.ts [--project <dir>]... [--bin <path>]
 *
 * The options carry the OpenAPI error registry, as the wrapper sends them.
 * Diagnostics are the ones finalize logged, compared in order.
 */
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deserializeInspectorState } from '@pikku/inspector/finalize'
import { toAnalysisOptions } from '../src/protocol.ts'
import { withOpenAPIErrors } from '../src/openapi-errors.ts'
import type { InspectorGoDiagnostic } from '../src/protocol.ts'
import { projectInput } from './project-input.ts'
import { comparableState, diffPaths } from './comparable.ts'
import { runTypeScript } from './run-ts.ts'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))

const args = process.argv.slice(2)
const projects: string[] = []
let bin = fileURLToPath(new URL('../bin/pikku-inspect', import.meta.url))
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project') projects.push(resolve(args[++i]!))
  else if (args[i] === '--bin') bin = resolve(args[++i]!)
}
if (projects.length === 0) {
  projects.push(
    join(REPO, 'templates/online-shop'),
    join(REPO, 'templates/functions')
  )
}

const show = (d: InspectorGoDiagnostic) =>
  `${d.level} ${d.code ? `[${d.code}] ` : ''}${d.message}`

let failed = false
for (const projectDir of projects) {
  console.log(`\n== ${projectDir.replace(REPO, '')}`)
  const reference = runTypeScript('reference', projectDir)
  const { options } = await projectInput(projectDir)

  const run = spawnSync(bin, ['finalize', '--stdin'], {
    input: JSON.stringify({
      state: reference.pre,
      options: withOpenAPIErrors(toAnalysisOptions(options)),
    }),
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  if (run.status !== 0) {
    console.log(`  binary failed (${run.status}): ${run.stderr}`)
    failed = true
    continue
  }
  const output = JSON.parse(run.stdout)
  const goPost = comparableState(
    deserializeInspectorState(output.state)
  ) as Record<string, unknown>
  const tsPost = reference.post as Record<string, unknown>

  for (const section of new Set([
    ...Object.keys(tsPost),
    ...Object.keys(goPost),
  ])) {
    const diffs = diffPaths(
      goPost[section],
      tsPost[section],
      200,
      `$.${section}`
    )
    if (diffs.length === 0) continue
    failed = true
    console.log(`  ${section}: ${diffs.length} diff(s)`)
    for (const d of diffs.slice(0, 8)) console.log(`    ${d}`)
  }

  const tsDiags = reference.postDiagnostics
    .slice(reference.preDiagnostics.length)
    .map(show)
  const goDiags = (output.diagnostics as InspectorGoDiagnostic[])
    .filter((d) => d.level !== 'debug')
    .map(show)
  const pass = output.validationPass
  const same =
    tsDiags.length === goDiags.length &&
    tsDiags.every((d, i) => d === goDiags[i])
  console.log(
    `  diagnostics: ts ${tsDiags.length}, go ${goDiags.length}${same ? ' (identical, in order)' : ''}; validationPass ${JSON.stringify(pass)}`
  )
  if (!same) {
    failed = true
    const goSet = new Set(goDiags)
    const tsSet = new Set(tsDiags)
    for (const d of tsDiags.filter((d) => !goSet.has(d)))
      console.log(`    - ts only: ${d.slice(0, 300)}`)
    for (const d of goDiags.filter((d) => !tsSet.has(d)))
      console.log(`    + go only: ${d.slice(0, 300)}`)
    if (
      tsDiags.every((d) => goSet.has(d)) &&
      goDiags.every((d) => tsSet.has(d))
    ) {
      console.log('    (same messages, different order)')
    }
  }
}
process.exit(failed ? 1 : 0)
