import type { ErrorCode, InspectorLogger } from '@pikku/inspector'
import type {
  InspectorGoDiagnostic,
  InspectorGoValidationPass,
} from './protocol.js'

/**
 * Hands the binary's messages to the logger the way the TypeScript inspector
 * would have emitted them: a coded critical, error or warn becomes a tracked
 * diagnostic, anything else a plain log line. When the binary ran finalize,
 * `validationPass` brackets the messages its validation pass logged, and the
 * logger is told where that pass begins and ends.
 */
export const replayDiagnostics = (
  logger: InspectorLogger,
  diagnostics: InspectorGoDiagnostic[],
  validationPass?: InspectorGoValidationPass
): void => {
  for (const [index, { level, code, message }] of diagnostics.entries()) {
    if (validationPass?.start === index) logger.beginValidationPass?.()
    if (validationPass?.end === index) logger.endValidationPass?.()
    if (level === 'critical') {
      if (!code) {
        throw new Error(
          `pikku-inspect sent a critical with no code: ${message}`
        )
      }
      logger.critical(code as ErrorCode, message)
    } else if (code && (level === 'error' || level === 'warn')) {
      logger.diagnostic({ severity: level, code: code as ErrorCode, message })
    } else {
      logger[level](message)
    }
  }
  if (validationPass) {
    if (validationPass.start >= diagnostics.length) {
      logger.beginValidationPass?.()
    }
    if (validationPass.end >= diagnostics.length) {
      logger.endValidationPass?.()
    }
  }
}

/**
 * A logger that records every call in the protocol's diagnostic shape. It is
 * how the TypeScript side of the parity harness captures what the reference
 * engine said, so both engines' messages compare like for like.
 */
export const createRecordingLogger = (): InspectorLogger & {
  diagnostics: InspectorGoDiagnostic[]
} => {
  const diagnostics: InspectorGoDiagnostic[] = []
  return {
    diagnostics,
    info: (message) => diagnostics.push({ level: 'info', message }),
    error: (message) => diagnostics.push({ level: 'error', message }),
    warn: (message) => diagnostics.push({ level: 'warn', message }),
    debug: (message) => diagnostics.push({ level: 'debug', message }),
    diagnostic: ({ severity, code, message }) =>
      diagnostics.push({ level: severity, code, message }),
    critical: (code, message) =>
      diagnostics.push({ level: 'critical', code, message }),
    hasCriticalErrors: () => diagnostics.some((d) => d.level === 'critical'),
  }
}
