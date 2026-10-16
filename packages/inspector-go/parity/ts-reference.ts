import { performance } from 'node:perf_hooks'
import { analyzeProgram, serializeInspectorState } from '@pikku/inspector'
import { createRecordingLogger } from '../src/diagnostics.ts'
import {
  INSPECTOR_PROTOCOL_VERSION,
  type InspectorGoInput,
  type InspectorGoOutput,
} from '../src/protocol.ts'

/**
 * The TypeScript engine speaking the `pikku-inspect` protocol: what the Go
 * binary is measured against, and a stand-in binary for the wrapper's tests.
 * Debug lines carry timings, so they are left out of the diagnostics.
 */
export const analyzeWithTypeScript = async (
  input: InspectorGoInput
): Promise<InspectorGoOutput> => {
  const start = performance.now()
  const logger = createRecordingLogger()
  const state = await analyzeProgram(logger, input.routeFiles, input.options)
  return {
    protocol: INSPECTOR_PROTOCOL_VERSION,
    finalized: false,
    state: serializeInspectorState(state),
    diagnostics: logger.diagnostics.filter((d) => d.level !== 'debug'),
    stats: {
      files: state.stats?.files ?? 0,
      projectFiles: state.stats?.projectFiles ?? 0,
      types: state.stats?.types ?? 0,
      symbols: state.stats?.symbols ?? 0,
      wallMs: Math.round(performance.now() - start),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    },
  }
}
