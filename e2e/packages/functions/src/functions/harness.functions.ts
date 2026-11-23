/**
 * The pieces of a harness loop: an agent that builds, a gate that reports
 * findings, the verdict that applies the gate's `failOn`, and `markDone`.
 *
 * The agent and the gate here are fakes driven by the run's input, so the loop
 * can be tested with no model, no network and no worktree.
 */
import { pikkuSessionlessFunc } from '#pikku/function'
import { recordEffect } from './chaos-ledger.js'

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type Finding = {
  file?: string
  line?: number
  severity: Severity
  rule?: string
  message: string
}

/**
 * What the fake gate does on one attempt: report these findings, or throw.
 * `delayMs` holds the first try of the step that long, so a test can kill the
 * server while the gate is running; a retried step does not wait again.
 */
export type FakeGateRun = {
  findings?: Finding[]
  throws?: string
  delayMs?: number
}

/** The workflow step a fake ran inside, for the effect ledger. */
type StepRef = { runId: string; invocationId?: string; stepAttempt: number }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Appends one line per invocation to the ledger under HARNESS_LEDGER_DIR, keyed
 * `<function>:<harness attempt>` with the step's own attempt count, so a test
 * can tell a settled step from one a restart ran again. Nothing is written when
 * the variable is unset.
 */
const recordInvocation = async (
  variables: {
    get: (name: string) => Promise<string | undefined> | string | undefined
  },
  func: string,
  attempt: number,
  step: StepRef | undefined
): Promise<void> => {
  const dir = await variables.get('HARNESS_LEDGER_DIR')
  if (!dir) return
  await recordEffect(dir, {
    key: `${func}:${attempt}`,
    runId: step?.runId ?? 'no-run',
    invocationId: step?.invocationId,
    attempt: step?.stepAttempt ?? 0,
    at: Date.now(),
  })
}

/** Waits `delayMs` on the first try of a step only. */
const delayFirstTry = async (
  delayMs: number | undefined,
  step: StepRef | undefined
): Promise<void> => {
  if (delayMs && (step?.stepAttempt ?? 1) <= 1) {
    await wait(delayMs)
  }
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
  { changeId: string; attempt: number; feedback: string; delayMs?: number },
  { changeId: string; attempt: number; heard: string }
>({
  description:
    'Stand in for the builder agent: records the feedback it was given and builds nothing',
  func: async ({ variables }, data, { workflowStep }) => {
    const step = workflowStep && {
      runId: workflowStep.runId,
      invocationId: workflowStep.invocationId,
      stepAttempt: workflowStep.attemptCount,
    }
    await recordInvocation(variables, 'harnessFakeAgent', data.attempt, step)
    await delayFirstTry(data.delayMs, step)
    return {
      changeId: data.changeId,
      attempt: data.attempt,
      heard: data.feedback,
    }
  },
})

/**
 * The gate is called from inside the `harnessRunGate` step, so that step hands
 * over its own run and attempt in `step`.
 */
export const harnessFakeGate = pikkuSessionlessFunc<
  { attempt: number; runs: FakeGateRun[]; step?: StepRef },
  { findings: Finding[] }
>({
  description:
    'Stand in for a gate: reports the findings scripted for this attempt, or throws as a broken tool would',
  func: async ({ variables }, data) => {
    const run = data.runs[data.attempt - 1] ?? {}
    await recordInvocation(
      variables,
      'harnessFakeGate',
      data.attempt,
      data.step
    )
    await delayFirstTry(run.delayMs, data.step)
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
  func: async (_services, data, { rpc, workflowStep }) => {
    try {
      const result = await rpc.invoke('harnessFakeGate', {
        attempt: data.attempt,
        runs: data.runs,
        step: workflowStep && {
          runId: workflowStep.runId,
          invocationId: workflowStep.invocationId,
          stepAttempt: workflowStep.attemptCount,
        },
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
