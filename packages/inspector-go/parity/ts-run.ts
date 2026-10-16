#!/usr/bin/env node
/**
 * One TypeScript inspection of one project, in a node process of its own,
 * written to a JSON file. Node because that is what the CLI runs on, and
 * because under bun the reference is wrong: once the schema pass has imported
 * the project's sources, bun's resolver stops finding addons' exported
 * metadata, so finalize loads no addon schemas and a second inspection in the
 * same process loads no addons at all.
 *
 *   node parity/ts-run.ts reference <projectDir> <outFile>
 *     analyze, then finalize the live state in place, which is `inspect`.
 *   node parity/ts-run.ts roundtrip <projectDir> <outFile>
 *     analyze, serialize, JSON, deserialize, then finalize the copy.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  analyzeProgram,
  serializeInspectorState,
  type SerializableInspectorState,
} from '@pikku/inspector'
import {
  deserializeInspectorState,
  finalizeInspectorState,
} from '@pikku/inspector/finalize'
import { createRecordingLogger } from '../src/diagnostics.ts'
import type { InspectorGoDiagnostic } from '../src/protocol.ts'
import { projectInput } from './project-input.ts'
import { comparableState, diffPaths } from './comparable.ts'

export interface TsRunResult {
  /** The serialized pre-finalize state, as the binary would print it. */
  pre: SerializableInspectorState
  preDiagnostics: InspectorGoDiagnostic[]
  /** The post-finalize state through `comparableState`. */
  post: unknown
  postDiagnostics: InspectorGoDiagnostic[]
  /**
   * reference only: the serialized post-finalize workflows section, which
   * finalize parity feeds in while finalizeWorkflows is not ported.
   */
  postWorkflows?: SerializableInspectorState['workflows']
  /** roundtrip only: where serialize/deserialize lost or changed something. */
  serializationDiffs?: string[]
}

const withoutDebug = (diagnostics: InspectorGoDiagnostic[]) =>
  diagnostics.filter((d) => d.level !== 'debug')

const [mode, projectDir, outFile] = process.argv.slice(2)
if (!['reference', 'roundtrip'].includes(mode) || !projectDir || !outFile) {
  console.error('usage: ts-run.ts reference|roundtrip <projectDir> <outFile>')
  process.exit(2)
}

const { routeFiles, options } = await projectInput(resolve(projectDir))
const logger = createRecordingLogger()
const analyzed = await analyzeProgram(logger, routeFiles, options).catch(
  (error) => {
    // The recording logger swallows what led up to the throw; show it.
    for (const d of logger.diagnostics) {
      if (d.level === 'error' || d.level === 'critical') {
        console.error(`[${d.level}] ${d.message}`)
      }
    }
    throw error
  }
)
// A copy, not the serialized view: serialization shares objects with the live
// state, and finalize below mutates them in place.
const pre: SerializableInspectorState = JSON.parse(
  JSON.stringify(serializeInspectorState(analyzed))
)
const preDiagnostics = withoutDebug(logger.diagnostics)

let result: TsRunResult
if (mode === 'reference') {
  await finalizeInspectorState(logger, analyzed, options)
  result = {
    pre,
    preDiagnostics,
    post: comparableState(analyzed),
    postDiagnostics: withoutDebug(logger.diagnostics),
    postWorkflows: JSON.parse(
      JSON.stringify(serializeInspectorState(analyzed).workflows)
    ),
  }
} else {
  const copy = deserializeInspectorState(structuredClone(pre))
  const serializationDiffs = diffPaths(
    comparableState(copy),
    comparableState(analyzed)
  )
  await finalizeInspectorState(logger, copy, options)
  result = {
    pre,
    preDiagnostics,
    post: comparableState(copy),
    postDiagnostics: withoutDebug(logger.diagnostics),
    serializationDiffs,
  }
}
writeFileSync(outFile, JSON.stringify(result))
