import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type {
  InspectorLogger,
  InspectorOptions,
  InspectorState,
} from '@pikku/inspector'
import { deserializeInspectorState } from '@pikku/inspector/finalize'
import { findInspectorBinary } from './binary.js'
import { runInspectorBinary } from './run-binary.js'
import { replayDiagnostics } from './diagnostics.js'
import { toAnalysisOptions, type InspectorGoInput } from './protocol.js'
import { withOpenAPIErrors } from './openapi-errors.js'

/**
 * Inspects `routeFiles` with the `pikku-inspect` binary, which runs analysis
 * and finalize, and replays its diagnostics on `logger`. The state it returns has no `program` and an empty `typesLookup`:
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
    options: withOpenAPIErrors(toAnalysisOptions(options)),
  }
  const output = await runInspectorBinary(findInspectorBinary(), input)
  replayDiagnostics(logger, output.diagnostics, output.validationPass)
  if (output.error !== undefined || !output.state) {
    throw new Error(output.error ?? 'pikku-inspect returned no state')
  }

  const state: InspectorState = {
    ...deserializeInspectorState(output.state),
    typesLookup: new Map(),
  }

  state.stats = {
    files: output.stats.files,
    projectFiles: output.stats.projectFiles,
    filesReused: 0,
    types: output.stats.types,
    instantiations: output.stats.instantiations ?? 0,
    symbols: output.stats.symbols,
    cpuMs: output.stats.cpuMs ?? 0,
    wallMs: Math.round(performance.now() - start),
    heapUsedMb: output.stats.heapUsedMb,
  }
  return state
}
