export type FindingKind =
  | 'server-error'
  | 'transport-error'
  | 'schema-violation'
  | 'unexpected-success'
  | 'custom'

export interface VirtualUserRunRow {
  runId: string
  persona: string
  status: 'running' | 'completed' | 'failed'
  createdAt: string
  finishedAt: string | null
  error: string | null
  findings: {
    kind: FindingKind
    detail: string
    step: number
    rpcName?: string
    status?: number
    intentId?: string
  }[]
  intents: { id: string; title: string; status: string }[]
  disposition?: string
  seed?: number
  tally?: { steps?: number; calls?: number; mutations?: number } | null
}

export interface ProblemLine {
  key: string
  persona: string
  kind: FindingKind | 'stopped'
  goal?: string
  count: number
  at: string
  details: VirtualUserRunRow['findings']
  error?: string
}

export interface PersonaLastTry {
  running: boolean
  last?: VirtualUserRunRow
}

const SEVERITY: Record<ProblemLine['kind'], number> = {
  'unexpected-success': 0,
  'server-error': 1,
  'schema-violation': 2,
  custom: 3,
  'transport-error': 4,
  stopped: 5,
}

export const lastTries = (
  runs: readonly VirtualUserRunRow[]
): Map<string, PersonaLastTry> => {
  const byPersona = new Map<string, PersonaLastTry>()
  const newestFirst = [...runs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
  for (const run of newestFirst) {
    const entry = byPersona.get(run.persona) ?? { running: false }
    if (run.status === 'running') entry.running = true
    else if (!entry.last) entry.last = run
    byPersona.set(run.persona, entry)
  }
  return byPersona
}

const bySeverity = (a: ProblemLine, b: ProblemLine) =>
  SEVERITY[a.kind] - SEVERITY[b.kind] || b.at.localeCompare(a.at)

/** One run's findings, one line per kind of problem per goal. */
export const runProblems = (run: VirtualUserRunRow): ProblemLine[] => {
  const lines = new Map<string, ProblemLine>()
  const at = run.finishedAt ?? run.createdAt
  const goals = new Map(run.intents.map((i) => [i.id, i.title]))
  for (const finding of run.findings) {
    const key = [
      run.persona,
      finding.kind,
      finding.intentId ?? '',
      finding.kind === 'custom' ? finding.detail : '',
    ].join('|')
    const line = lines.get(key) ?? {
      key,
      persona: run.persona,
      kind: finding.kind,
      goal: finding.intentId ? goals.get(finding.intentId) : undefined,
      count: 0,
      at,
      details: [],
    }
    line.count += 1
    line.details.push(finding)
    lines.set(key, line)
  }
  if (run.status === 'failed' && run.error) {
    lines.set(`${run.persona}|stopped`, {
      key: `${run.persona}|stopped`,
      persona: run.persona,
      kind: 'stopped',
      count: 1,
      at,
      details: [],
      error: run.error,
    })
  }
  return [...lines.values()].sort(bySeverity)
}

export const problemCount = (lines: readonly ProblemLine[]) =>
  lines.filter((line) => line.kind !== 'stopped').length

export const timeAgo = (iso: string, locale: string, now = Date.now()) => {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit)
    }
  }
  return format.format(0, 'minute')
}

export const goalsReached = (run: VirtualUserRunRow) =>
  run.intents.filter((intent) => intent.status === 'completed').length

export const visitMinutes = (run: VirtualUserRunRow) =>
  run.finishedAt
    ? Math.round(
        (new Date(run.finishedAt).getTime() -
          new Date(run.createdAt).getTime()) /
          60_000
      )
    : undefined
