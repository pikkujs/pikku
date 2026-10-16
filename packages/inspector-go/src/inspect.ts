import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type {
  InspectorLogger,
  InspectorOptions,
  InspectorState,
} from '@pikku/inspector'
import {
  deserializeInspectorState,
  finalizeInspectorState,
} from '@pikku/inspector/finalize'
import { findInspectorBinary } from './binary.js'
import { runInspectorBinary } from './run-binary.js'
import { replayDiagnostics } from './diagnostics.js'
import { toAnalysisOptions, type InspectorGoInput } from './protocol.js'

/**
 * `@pikku/inspector`'s `inspect`, with analysis done by the `pikku-inspect`
 * binary. The state it returns has no `program` and an empty `typesLookup`:
 * the Go engine has no TypeScript objects to hand back.
 */
export const inspect = async (
  logger: InspectorLogger,
  routeFiles: string[],
  options: InspectorOptions = {}
): Promise<InspectorState> => {
  const start = performance.now()
  const input: InspectorGoInput = {
    routeFiles: routeFiles.map((file) => resolve(file)),
    options: toAnalysisOptions(options),
  }
  const output = await runInspectorBinary(findInspectorBinary(), input)
  replayDiagnostics(logger, output.diagnostics, output.validationPass)

  const state: InspectorState = {
    ...deserializeInspectorState(output.state),
    typesLookup: new Map(),
  }
  if (!output.finalized) {
    await finalizeInspectorState(logger, state, options)
  }

  state.stats = {
    files: output.stats.files,
    projectFiles: output.stats.projectFiles,
    filesReused: 0,
    types: output.stats.types,
    instantiations: 0,
    symbols: output.stats.symbols,
    cpuMs: 0,
    wallMs: Math.round(performance.now() - start),
    heapUsedMb: output.stats.heapUsedMb,
  }
  return state
}
