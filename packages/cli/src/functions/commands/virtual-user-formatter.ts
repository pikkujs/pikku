/**
 * The virtual user run report, and how it is rendered.
 *
 * A run is not a pass/fail: a virtual user pursuing plausible goals against a
 * real stage produces a story — what it tried, what it gave up on, and what
 * came back that should not have. The findings are the product; everything else
 * is context for reading them.
 *
 * Kept a pure function over plain data for the same reason the scenario
 * reporter is: a second formatter (JSON for fabric, JUnit for CI) is then one
 * function rather than an unpicking of the runner.
 */
import type {
  VirtualUserFinding,
  VirtualUserRunResult,
} from '@pikku/core/virtual-user'

export interface VirtualUserReportContext {
  persona: string
  disposition: string
  environment: string
  apiUrl: string
  /** How much of the catalogue's read/write split had to be guessed at. */
  catalogue: { total: number; annotated: number; inferred: number }
}

export interface VirtualUserReportLine {
  level: 'info' | 'error' | 'warn'
  text: string
}

const STATUS_MARK: Record<string, string> = {
  completed: 'DONE',
  abandoned: 'DROP',
  stuck: 'STUCK',
  suspended: 'OPEN',
  open: 'OPEN',
}

/** Why a run ended, in words rather than an enum. */
const STOPPED_BY: Record<VirtualUserRunResult['stoppedBy'], string> = {
  'no-intents': 'this persona had nothing to want — no scenario names them',
  'budget-steps': 'ran out of steps',
  'budget-mutations': 'ran out of mutations',
  'budget-duration': 'ran out of time',
  'stop-hook': 'the app called a halt',
  exhausted: 'saw everything it came for through',
}

const findingLine = (finding: VirtualUserFinding): string =>
  `  ${finding.kind.padEnd(18)} ${finding.detail} (step ${finding.step})`

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

export const formatVirtualUserReport = (
  result: VirtualUserRunResult,
  context: VirtualUserReportContext
): VirtualUserReportLine[] => {
  const lines: VirtualUserReportLine[] = []
  const info = (text: string) => lines.push({ level: 'info', text })
  const error = (text: string) => lines.push({ level: 'error', text })
  const warn = (text: string) => lines.push({ level: 'warn', text })

  info(
    `Virtual user '${context.persona}' (${context.disposition}) against '${context.environment}' — ${context.apiUrl}`
  )
  info(
    `  seed ${result.seed} · ${plural(context.catalogue.total, 'endpoint')} offered` +
      (context.catalogue.inferred
        ? ` · read/write guessed for ${context.catalogue.inferred} of them`
        : '')
  )

  if (result.intents.length) {
    info('')
    info('What it tried')
    for (const intent of result.intents) {
      const mark = STATUS_MARK[intent.status] ?? intent.status.toUpperCase()
      const interrupted = intent.suspensions
        ? `, put down ${plural(intent.suspensions, 'time')}`
        : ''
      const summary = intent.summary ? ` — ${intent.summary}` : ''
      info(
        `  ${mark.padEnd(5)} ${intent.title} (${plural(intent.steps.length, 'step')}${interrupted})${summary}`
      )
    }
  }

  info('')
  if (result.findings.length === 0) {
    info('Nothing came back that should not have.')
  } else {
    error(`${plural(result.findings.length, 'finding')}`)
    for (const finding of result.findings) {
      error(findingLine(finding))
    }
  }

  const { tally } = result
  info('')
  info(
    `${plural(tally.steps, 'step')} · ${plural(tally.calls, 'call')} · ` +
      `${plural(tally.mutations, 'mutation')} · ${tally.tokensIn}/${tally.tokensOut} tokens ` +
      `(${tally.model}) · ${Math.round(tally.elapsedMs / 1000)}s`
  )
  info(`Stopped because it ${STOPPED_BY[result.stoppedBy]}.`)

  if (result.stoppedBy === 'no-intents') {
    warn(
      `Give it something to want: declare a scenario naming '${context.persona}', or pass --goals.`
    )
  }
  // A seed is only worth printing when there is something to reproduce.
  if (result.findings.length) {
    info(`Replay this exact run with --seed ${result.seed}.`)
  }

  return lines
}
