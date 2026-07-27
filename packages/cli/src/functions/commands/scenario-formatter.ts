/**
 * The scenario run report, and how it is rendered.
 *
 * Everything a run prints goes through here, so the shape of the output is one
 * file rather than log calls scattered through the command. The report itself
 * is plain serialisable data — no Maps, no meta handles — which is what makes a
 * second formatter (JSON, JUnit) a matter of writing one function rather than
 * unpicking the runner.
 */
import type { ScenarioBrowserFailure } from '@pikku/core/workflow'

/** The longest gherkin keyword ("Given"), so sentences line up under each other. */
const KEYWORD_WIDTH = 5

/** One step of a run, already joined to the prose that declared it. */
export interface ScenarioStepRow {
  sentence: string
  status: string
  durationMs?: number
  error?: string
}

/** Everything known about why one scenario failed. */
export interface ScenarioFailureDetail {
  /** The rendered sentence of the failing step; absent if no step failed. */
  sentence?: string
  message: string
  stack?: string
  /**
   * True when the failure was a deliberate one (a PikkuError). Its message is
   * the whole story, so the stack is noise.
   */
  expected?: boolean
  browser?: ScenarioBrowserFailure[]
}

export interface ScenarioResult {
  name: string
  status: 'passed' | 'failed'
  durationMs: number
  output?: unknown
  error?: string
  steps?: ScenarioStepRow[]
  failure?: ScenarioFailureDetail
}

export interface ScenarioRunReport {
  environment: string
  results: ScenarioResult[]
  /** Scenarios not run at all, by name — today, browser ones under --no-browser. */
  skipped: string[]
  /** Feature-level hook failures, which belong to no single scenario. */
  hookFailures: string[]
}

export interface ScenarioReportLine {
  level: 'info' | 'error'
  text: string
}

export interface FormatScenarioReportOptions {
  /** Keep every stack frame, including the framework's own. */
  trace?: boolean
  /** Frames under this directory are the project's own. */
  projectRoot?: string
}

export const formatScenarioReport = (
  report: ScenarioRunReport,
  options: FormatScenarioReportOptions = {}
): ScenarioReportLine[] => {
  const lines: ScenarioReportLine[] = []
  const info = (text: string) => lines.push({ level: 'info', text })
  const error = (text: string) => lines.push({ level: 'error', text })

  for (const name of report.skipped) {
    info(`SKIP ${name} (browser steps, --no-browser)`)
  }

  for (const result of report.results) {
    if (result.status === 'passed') {
      const output =
        result.output !== undefined ? ` → ${JSON.stringify(result.output)}` : ''
      info(`PASS ${result.name} (${result.durationMs}ms)${output}`)
    } else {
      error(
        `FAIL ${result.name} (${result.durationMs}ms): ${firstLine(result.error)}`
      )
    }
    for (const line of buildStepLadder(result.steps ?? [])) {
      info(line)
    }
    if (result.failure) {
      for (const line of formatScenarioFailure(result.failure, options)) {
        error(line)
      }
    }
  }

  for (const hookFailure of report.hookFailures) {
    error(hookFailure)
  }

  const failed = report.results.filter((r) => r.status === 'failed').length
  const skippedSuffix = report.skipped.length
    ? `, ${report.skipped.length} skipped (--no-browser)`
    : ''
  const hookSuffix = report.hookFailures.length
    ? `, ${report.hookFailures.length} feature hook failure(s)`
    : ''
  info(
    `${report.results.length - failed}/${report.results.length} scenarios passed against '${report.environment}'${skippedSuffix}${hookSuffix}`
  )
  return lines
}

export const buildStepLadder = (steps: ScenarioStepRow[]): string[] => {
  const width = Math.max(0, ...steps.map(({ sentence }) => sentence.length))
  return steps.map((step) => {
    const glyph = step.status === 'succeeded' ? '✓' : '✗'
    const detail =
      step.status === 'succeeded' || !step.error
        ? formatDuration(step.durationMs)
        : firstLine(step.error)
    return `  ${step.sentence.padEnd(width)}  ${glyph}  ${detail}`
  })
}

/**
 * The one line a summary gets. A browser timeout's message carries its whole
 * call log; the failure block below prints all of it, so the row above only
 * needs enough to recognise it by.
 */
const firstLine = (message?: string) => (message ?? '').split('\n')[0] ?? ''

/**
 * The indented block printed under a failed scenario's ladder.
 *
 * One line of `run.error.message` is what a browser step's "Timed out waiting
 * for selector" looks like with all of its context removed. The page's own
 * console errors and failed API calls almost always say why the selector never
 * appeared, and the driver has been collecting them all along.
 */
export const formatScenarioFailure = (
  failure: ScenarioFailureDetail,
  { trace = false, projectRoot }: FormatScenarioReportOptions = {}
): string[] => {
  const lines: string[] = []
  if (failure.sentence) {
    lines.push(`  ✗ failed at: ${failure.sentence}`)
  }
  for (const line of failure.message.split('\n')) {
    lines.push(`    ${line}`)
  }

  for (const browser of failure.browser ?? []) {
    lines.push(
      `    browser (${browser.actor})${browser.url ? `: ${browser.url}` : ''}`
    )
    const detail = (label: string, values: string[]) => {
      for (const value of values) {
        lines.push(`      ${`${label}:`.padEnd(11)} ${value}`)
      }
    }
    detail('console', browser.consoleErrors)
    detail('page', browser.pageErrors)
    detail('request', browser.failedRequests)
    detail('api', browser.apiErrors)
    if (browser.screenshot) {
      lines.push(`      screenshot: ${browser.screenshot}`)
    }
  }

  // An expected failure is a deliberate one — where it was thrown from adds
  // nothing the message and the ladder do not already say.
  if (failure.stack && !failure.expected) {
    for (const frame of stackFrames(failure.stack, trace, projectRoot)) {
      lines.push(`    ${frame}`)
    }
  }
  return lines
}

/**
 * The project's own frames — the ones a reader can act on. Framework and node
 * internals are dropped unless `trace`, or unless dropping them would leave
 * nothing at all: some stack always beats no stack.
 */
const stackFrames = (
  stack: string,
  trace: boolean,
  projectRoot?: string
): string[] => {
  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
  if (trace || !projectRoot) {
    return frames
  }
  const own = frames.filter(
    (frame) => frame.includes(projectRoot) && !frame.includes('node_modules')
  )
  return own.length > 0 ? own : frames
}

const formatDuration = (durationMs?: number) => {
  if (durationMs === undefined) {
    return ''
  }
  return durationMs < 1000
    ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`
}

export { KEYWORD_WIDTH }
