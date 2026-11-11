import { relative } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { CheckDiagnostic } from './tsc-check.js'

/**
 * Marks an uncoded `logger.error` in the diagnostics file. They only mean
 * something once a run has failed, so a passing pass drops them.
 */
export const LOGGED_ERROR_CODE = 'LOG'

const MAX_MESSAGE = 600
const FALLBACK_LINES = 5

const MISSING_SCHEMA =
  /^Could not find exported schema '(.+?)' in (.+?) for .+?\.( Available exports: .*)?$/
const UNCONVERTED_SCHEMA = /^Could not convert Zod schema '(.+?)': (.*)$/
const IMPORTED_FROM = / imported from .*$/
const RUN_FAILED = /^Workflow \S+ \(run .+\) failed:$/
const NOT_A_CAUSE =
  /^Schema generation failed|^Workflow \S+ \(run .+\) failed:$/
const STACK_FRAME = /^\s+at /
const CODED = /^\[(PKU\d+)\]\s*/
const ERROR_NAME = /^\w*Error:\s*/

const firstLine = (text: string): string => text.split('\n', 1)[0]!.trim()

const clip = (text: string): string =>
  text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text

/** What a run threw: the block after its failure line, up to the first frame. */
const fatalBlock = (lines: string[]): string | undefined => {
  const start = lines.findLastIndex((line) => RUN_FAILED.test(line))
  if (start === -1) return undefined
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => STACK_FRAME.test(line))
  const block = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return block.replace(ERROR_NAME, '') || undefined
}

const asDiagnostic = (message: string): CheckDiagnostic => {
  const coded = CODED.exec(message)
  return {
    severity: 'critical',
    code: coded ? coded[1]! : 'CODEGEN',
    message: clip(coded ? message.slice(coded[0].length) : message),
  }
}

/** One diagnostic per distinct error: a bad import fails every schema behind it. */
const errorDiagnostics = (messages: string[]): CheckDiagnostic[] => {
  const diagnostics = new Map<string, CheckDiagnostic>()
  const unconverted = new Map<string, string[]>()
  for (const message of messages) {
    const line = firstLine(message)
    const missing = MISSING_SCHEMA.exec(line)
    const failed = UNCONVERTED_SCHEMA.exec(line)
    if (missing) {
      diagnostics.set(line, {
        severity: 'critical',
        code: 'SCHEMA',
        file: relative(process.cwd(), missing[2]!),
        message: clip(
          `Schema '${missing[1]}' must be exported from this file.${missing[3] ?? ''}`
        ),
      })
    } else if (failed) {
      const reason = failed[2]!.replace(IMPORTED_FROM, '')
      const schemas = unconverted.get(reason) ?? []
      if (!schemas.includes(failed[1]!)) schemas.push(failed[1]!)
      unconverted.set(reason, schemas)
    } else if (line && !NOT_A_CAUSE.test(line)) {
      diagnostics.set(line, asDiagnostic(line))
    }
  }
  for (const [reason, schemas] of unconverted) {
    const which =
      schemas.length === 1
        ? `schema '${schemas[0]}'`
        : `${schemas.length} schemas, first '${schemas[0]}'`
    diagnostics.set(reason, {
      severity: 'critical',
      code: 'SCHEMA',
      message: clip(`${reason} (${which})`),
    })
  }
  return [...diagnostics.values()]
}

/**
 * The real errors of a failed codegen run, causes first. What the run threw goes
 * last: when anything else went wrong it is a consequence of that, so its first
 * line is all it keeps. No stack frames either way.
 */
export const codegenFailureDiagnostics = ({
  logged,
  output,
}: {
  /** The run's `logger.error` lines; warnings printed alongside are not in it. */
  logged: string[]
  /** The run's stderr, for what it could not log before it died. */
  output: string
}): CheckDiagnostic[] => {
  const lines = stripVTControlCharacters(output).split('\n')
  const errors = errorDiagnostics([
    ...logged,
    ...lines.filter((line) => /^Could not (find|convert) /.test(line)),
  ])
  const fatal = fatalBlock(lines)
  if (!fatal) return errors
  if (errors.length > 0) {
    return [...errors, asDiagnostic(firstLine(fatal))]
  }
  return [asDiagnostic(fatal)]
}

/** The last lines of a failure nothing above could read. */
export const failureTail = (output: string): string =>
  stripVTControlCharacters(output)
    .split('\n')
    .filter((line) => line.trim() && !STACK_FRAME.test(line))
    .slice(-FALLBACK_LINES)
    .join('\n')
