/**
 * The pieces of a harness loop: an agent that builds, a gate that reports
 * findings, the verdict that applies the gate's `failOn`, and `markDone`.
 *
 * The agent and the gate here are fakes driven by the run's input, so the loop
 * can be tested with no model, no network and no worktree.
 */
import { pikkuSessionlessFunc } from '#pikku/function'

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type Finding = {
  file?: string
  line?: number
  severity: Severity
  rule?: string
  message: string
}

/** What the fake gate does on one attempt: report these findings, or throw. */
export type FakeGateRun = {
  findings?: Finding[]
  throws?: string
}

const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical']

const findingKey = (finding: Finding): string =>
  [
    finding.file ?? '',
    finding.line ?? '',
    finding.rule ?? '',
    finding.severity,
    finding.message,
  ].join('|')

const describeFinding = (finding: Finding): string => {
  const where = finding.file
    ? `${finding.file}${finding.line !== undefined ? `:${finding.line}` : ''} `
    : ''
  const rule = finding.rule ? `(${finding.rule}) ` : ''
  return `- [${finding.severity}] ${where}${rule}${finding.message}`
}

export const harnessFakeAgent = pikkuSessionlessFunc<
  { changeId: string; attempt: number; feedback: string },
  { changeId: string; attempt: number; heard: string }
>({
  description:
    'Stand in for the builder agent: records the feedback it was given and builds nothing',
  func: async (_services, data) => ({
    changeId: data.changeId,
    attempt: data.attempt,
    heard: data.feedback,
  }),
})

export const harnessFakeGate = pikkuSessionlessFunc<
  { attempt: number; runs: FakeGateRun[] },
  { findings: Finding[] }
>({
  description:
    'Stand in for a gate: reports the findings scripted for this attempt, or throws as a broken tool would',
  func: async (_services, data) => {
    const run = data.runs[data.attempt - 1] ?? {}
    if (run.throws) {
      throw new Error(run.throws)
    }
    return { findings: run.findings ?? [] }
  },
})

/**
 * Runs a gate and keeps a gate that throws apart from a gate that found
 * something: a throw is `infra` (a missing binary, a timeout, output it could
 * not parse) and says nothing about the agent's work.
 */
export const harnessRunGate = pikkuSessionlessFunc<
  { attempt: number; runs: FakeGateRun[] },
  { infra: boolean; error: string; findings: Finding[] }
>({
  description:
    'Run one gate; a gate that throws is reported as infra instead of failing the run',
  func: async (_services, data, { rpc }) => {
    try {
      const result = await rpc.invoke('harnessFakeGate', {
        attempt: data.attempt,
        runs: data.runs,
      })
      return { infra: false, error: '', findings: result.findings }
    } catch (error) {
      return {
        infra: true,
        error: error instanceof Error ? error.message : String(error),
        findings: [],
      }
    }
  },
})

export const harnessVerdict = pikkuSessionlessFunc<
  { findings: Finding[]; failOn: Severity; previous: Finding[] },
  {
    passed: boolean
    repeated: boolean
    failing: Finding[]
    notes: Finding[]
    feedback: string
  }
>({
  description:
    'Apply failOn: findings at or above it fail and become feedback, findings below it are notes',
  func: async (_services, data) => {
    const threshold = SEVERITY_ORDER.indexOf(data.failOn)
    const failing = data.findings.filter(
      (finding) => SEVERITY_ORDER.indexOf(finding.severity) >= threshold
    )
    const notes = data.findings.filter(
      (finding) => SEVERITY_ORDER.indexOf(finding.severity) < threshold
    )
    const previous = new Set(data.previous.map(findingKey))
    const current = new Set(failing.map(findingKey))
    const repeated =
      current.size > 0 &&
      current.size === previous.size &&
      [...current].every((key) => previous.has(key))
    const feedback =
      failing.length === 0
        ? ''
        : [
            `The gates found ${failing.length} problem${failing.length === 1 ? '' : 's'} to fix:`,
            ...failing.map(describeFinding),
          ].join('\n')
    return {
      passed: failing.length === 0,
      repeated,
      failing,
      notes,
      feedback,
    }
  },
})

export const harnessMarkDone = pikkuSessionlessFunc<
  { changeId: string; attempts: number },
  { changeId: string; done: boolean }
>({
  description: 'Mark the change done once every required gate has passed',
  func: async (_services, data) => ({ changeId: data.changeId, done: true }),
})
