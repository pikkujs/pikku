import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getDurationInMilliseconds } from '@pikku/core/utils'
import { commitFixes } from './commit.js'
import {
  atOrAbove,
  failingKey,
  formatFeedback,
  type GateFindings,
} from './feedback.js'
import { HarnessInfraError, type Finding, type InfraKind } from './finding.js'
import {
  createGateWire,
  type GateStage,
  type GateWire,
  type HarnessGate,
} from './gate.js'
import { gitIn } from './git.js'
import { redact } from './redact.js'
import type { HarnessSteps, StepOptions } from './steps.js'
import {
  DEFAULT_WRITES,
  guardWrites,
  snapshotTree,
  type TreeSnapshot,
} from './write-guard.js'

export type HarnessPolicy = {
  /** Agent turns before the run gives up. Defaults to 3. */
  tries?: number
  /** Stop when an attempt fails with exactly the findings of the one before. Defaults to true. */
  stopOnRepeat?: boolean
  /** Longest feedback message sent to the agent. Defaults to 6000. */
  feedbackMaxChars?: number
}

export type Harness = {
  name: string
  gates: HarnessGate[]
  policy?: HarnessPolicy
}

export type AgentOutcome = 'done' | 'needs-answer' | 'failed'

export type HarnessAgent = (input: {
  attempt: number
  feedback?: string
}) => Promise<{ outcome: AgentOutcome }>

export type HarnessEventStatus =
  'ok' | 'fail' | 'infra' | 'error' | 'needs-answer'

export type HarnessEvent = {
  name: string
  gate?: string
  attempt: number
  status: HarnessEventStatus
  durationMs: number
}

export type HarnessNote = { gate: string; attempt: number; finding: Finding }

export type HarnessStatus =
  'done' | 'gave-up' | 'repeated' | 'infra' | 'needs-answer' | 'failed'

export type HarnessResult = {
  status: HarnessStatus
  attempts: number
  /** Every message sent to the agent, in order. */
  feedbackHistory: string[]
  /** Findings below their gate's `failOn`, from every attempt; never sent to the agent. */
  notes: HarnessNote[]
  /** The failing findings of the last attempt, when it failed. */
  failing?: GateFindings[]
  /**
   * What could not give an answer, when the run ended as `infra`: a gate, a commit, or `agent` (the
   * agent could not run, such as a provider usage limit). `retryAfterMs` is set when the failing
   * service said how long to wait, so a caller can schedule the retry.
   */
  infra?: {
    gate: string
    kind: InfraKind
    message: string
    retryAfterMs?: number
  }
}

export type RunHarnessOptions = {
  worktree: string
  base: string
  /** Change id of the last item of the changeset, for the fix commits' `Change-Id:` trailer. */
  changeId: string
  shortId: string
  changeset: string
  harness: Harness
  agent: HarnessAgent
  steps: HarnessSteps
  onEvent?: (event: HarnessEvent) => void
  /** Runs `done` for the changeset; called once, after an attempt passes every gate. */
  markDone: () => Promise<void>
  /** Where gates keep their own files; defaults to `pikku-harness/` in the worktree's git dir. */
  scratch?: string
  gitBinary?: string
  /** Stops the run: a gate running then is stopped (its tools too) and the run ends as `infra` (`aborted`). */
  signal?: AbortSignal
}

const STAGES: GateStage[] = ['check', 'fixer', 'gate']

const stageOf = (gate: HarnessGate): GateStage => gate.stage ?? 'gate'
const writesOf = (gate: HarnessGate) => gate.writes ?? DEFAULT_WRITES

const validate = (harness: Harness) => {
  const names = new Set<string>()
  for (const gate of harness.gates) {
    if (names.has(gate.name))
      throw new Error(
        `Harness ${harness.name} has two gates named ${gate.name}`
      )
    if (gate.name === CLEAN_TREE || gate.name === AGENT)
      throw new Error(`Gate name ${gate.name} is kept for the engine`)
    names.add(gate.name)
    if (!STAGES.includes(stageOf(gate)))
      throw new Error(`Gate ${gate.name} has an unknown stage ${gate.stage}`)
    if (
      stageOf(gate) === 'gate' &&
      !writesOf(gate).every((glob) => glob.startsWith('.pikku/'))
    )
      throw new Error(
        `Gate ${gate.name} writes ${writesOf(gate).join(', ')}; a gate that writes outside .pikku must be a fixer`
      )
  }
  const tries = harness.policy?.tries ?? 3
  if (!Number.isInteger(tries) || tries < 1)
    throw new Error(`Harness ${harness.name} needs tries of 1 or more`)
}

/** A run that ends without a verdict. */
class Stop {
  constructor(readonly infra: NonNullable<HarnessResult['infra']>) {}
}

type GateOutcome = { findings: Finding[]; changed: string[] }

const timeoutOf = (gate: HarnessGate) =>
  gate.workflowTimeout === undefined
    ? undefined
    : getDurationInMilliseconds(gate.workflowTimeout)

/** How long a timed-out gate gets to stop once its signal is aborted. */
const STOP_GRACE_MS = 5_000

const delay = (ms: number, keep: (timer: NodeJS.Timeout) => void) =>
  new Promise<'expired'>((done) => keep(setTimeout(() => done('expired'), ms)))

/**
 * One run of a gate. Once its `workflowTimeout` has passed the wire's signal is aborted, which stops
 * any tool it started through `runCli`, and the run fails as `timeout` after the gate has stopped
 * (or after a grace period), so the write guard and a retry never race a tool still running. The
 * run's own `stop` signal aborts the wire's signal too; the tool then throws `aborted`.
 */
const runOnce = async (
  gate: HarnessGate,
  fields: Omit<GateWire, 'runCli' | 'signal'>,
  stop?: AbortSignal
): Promise<Finding[]> => {
  const controller = new AbortController()
  if (stop?.aborted)
    throw new HarnessInfraError(
      'aborted',
      `Gate ${gate.name} was not run: the run was stopped`
    )
  const onStop = () => controller.abort()
  stop?.addEventListener('abort', onStop, { once: true })
  try {
    return await runUntil(gate, fields, controller)
  } finally {
    stop?.removeEventListener('abort', onStop)
  }
}

const runUntil = async (
  gate: HarnessGate,
  fields: Omit<GateWire, 'runCli' | 'signal'>,
  controller: AbortController
): Promise<Finding[]> => {
  const running = gate.run(
    createGateWire({ ...fields, signal: controller.signal })
  )
  const limit = timeoutOf(gate)
  if (limit === undefined) return running
  let timer: NodeJS.Timeout | undefined
  try {
    const first = await Promise.race([
      running,
      delay(limit, (t) => (timer = t)),
    ])
    if (first !== 'expired') return first
  } finally {
    clearTimeout(timer)
  }
  controller.abort()
  try {
    await Promise.race([
      running.catch(() => undefined),
      delay(STOP_GRACE_MS, (t) => (timer = t)),
    ])
  } finally {
    clearTimeout(timer)
  }
  throw new HarnessInfraError(
    'timeout',
    `Gate ${gate.name} did not finish within ${limit} ms`
  )
}

/** Not a gate: the check that the agent committed its work, named like one in feedback. */
const CLEAN_TREE = 'clean-tree'
/** Not a gate: the name an agent infra error is reported under. */
const AGENT = 'agent'

const uncommittedFinding = (file: string): Finding => ({
  file,
  severity: 'high',
  rule: 'harness/uncommitted',
  message: 'uncommitted changes: commit them',
})

/**
 * Builds a changeset: the agent works, the gates judge, failing findings go back to the agent until
 * an attempt passes (`done`), the agent gets nowhere (`repeated`) or runs out of tries (`gave-up`).
 * A gate that cannot answer ends the run as `infra` without the agent hearing of it.
 */
export const runHarness = async (
  options: RunHarnessOptions
): Promise<HarnessResult> => {
  const {
    worktree,
    base,
    changeId,
    shortId,
    changeset,
    harness,
    agent,
    steps,
    onEvent,
    markDone,
    gitBinary,
    signal,
  } = options
  validate(harness)
  const tries = harness.policy?.tries ?? 3
  const stopOnRepeat = harness.policy?.stopOnRepeat ?? true
  const feedbackMaxChars = harness.policy?.feedbackMaxChars ?? 6000
  const scratchRoot =
    options.scratch ??
    join(
      (
        await gitIn(worktree, gitBinary)(['rev-parse', '--absolute-git-dir'])
      ).trim(),
      'pikku-harness'
    )

  const feedbackHistory: string[] = []
  const notes: HarnessNote[] = []

  /** A step, timed and reported. `statusOf` reads the step's result. */
  const record = async <T>(
    name: string,
    meta: StepOptions & { attempt: number },
    fn: () => Promise<T>,
    statusOf: (result: T) => HarnessEventStatus = () => 'ok'
  ): Promise<T> => {
    const started = performance.now()
    const emit = (status: HarnessEventStatus) =>
      onEvent?.({
        name,
        ...(meta.gate === undefined ? {} : { gate: meta.gate }),
        attempt: meta.attempt,
        status,
        durationMs: Math.round(performance.now() - started),
      })
    try {
      const result = await steps.step(name, fn, meta)
      emit(statusOf(result))
      return result
    } catch (error) {
      emit(error instanceof HarnessInfraError ? 'infra' : 'error')
      throw error
    }
  }

  const infraStop = (gate: string, error: HarnessInfraError) =>
    new Stop({
      gate,
      kind: error.kind,
      message: redact(error.message),
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
    })

  /**
   * The tree a stage's write guard compares against, recorded as a step: a gate that a restart runs
   * again is guarded against the tree as it was before its first run, so what that run wrote is
   * still seen (and committed) as its change.
   */
  const snapshot = async (name: string): Promise<TreeSnapshot> =>
    new Map(
      await steps.step(name, async () => [
        ...(await snapshotTree(worktree, gitBinary)).entries(),
      ])
    )

  /**
   * Runs a gate with its retries. Every run is guarded against `before`, the tree as it was before
   * the first run, with `writes` as the allowlist. Thrown errors are retried; after the last try a
   * HarnessInfraError stops the run and any other error is rethrown.
   */
  const runGate = async (
    gate: HarnessGate,
    attempt: number,
    before: TreeSnapshot,
    writes: string[]
  ): Promise<GateOutcome> => {
    const scratch = join(scratchRoot, gate.name)
    await mkdir(scratch, { recursive: true })
    const wire = { worktree, base, attempt, changeId, scratch }
    const runs = (gate.workflowRetries ?? 0) + 1
    for (let run = 1; ; run++) {
      const name = `attempt-${attempt}:${stageOf(gate)}:${gate.name}${run > 1 ? `:try-${run}` : ''}`
      try {
        return await record(
          name,
          { attempt, gate: gate.name },
          async () => {
            const findings = await runOnce(gate, wire, signal)
            const changed = await guardWrites({
              worktree,
              before,
              writes,
              gate: gate.name,
              gitBinary,
            })
            return { findings, changed }
          },
          ({ findings }) =>
            findings.some((finding) => atOrAbove(finding.severity, gate.failOn))
              ? 'fail'
              : 'ok'
        )
      } catch (error) {
        if (run < runs) continue
        if (error instanceof HarnessInfraError)
          throw infraStop(gate.name, error)
        throw error
      }
    }
  }

  /** Splits a gate's findings into failing ones and notes. */
  const judge = (
    gate: HarnessGate,
    attempt: number,
    findings: Finding[],
    failing: GateFindings[]
  ) => {
    const fails = findings.filter((finding) =>
      atOrAbove(finding.severity, gate.failOn)
    )
    for (const finding of findings)
      if (!atOrAbove(finding.severity, gate.failOn))
        notes.push({ gate: gate.name, attempt, finding })
    if (fails.length) failing.push({ gate: gate.name, findings: fails })
  }

  const gatesIn = (stage: GateStage) =>
    harness.gates.filter((gate) => stageOf(gate) === stage)

  /** The check, fixer and read-only stages of one attempt; returns the failing findings. */
  const runGates = async (attempt: number): Promise<GateFindings[]> => {
    const failing: GateFindings[] = []

    for (const gate of gatesIn('check')) {
      const before = await snapshot(
        `attempt-${attempt}:snapshot:check:${gate.name}`
      )
      const { findings } = await runGate(gate, attempt, before, writesOf(gate))
      judge(gate, attempt, findings, failing)
    }

    for (const gate of gatesIn('fixer')) {
      const before = await snapshot(
        `attempt-${attempt}:snapshot:fixer:${gate.name}`
      )
      const { findings, changed } = await runGate(
        gate,
        attempt,
        before,
        writesOf(gate)
      )
      judge(gate, attempt, findings, failing)
      if (!changed.length) continue
      try {
        await record(
          `attempt-${attempt}:commit:${gate.name}`,
          { attempt, gate: gate.name },
          () =>
            commitFixes({
              worktree,
              paths: changed,
              gate: gate.name,
              shortId,
              changeId,
              changeset,
              message: `apply ${gate.name} fixes (attempt ${attempt})`,
              gitBinary,
            })
        )
      } catch (error) {
        if (error instanceof HarnessInfraError)
          throw infraStop(gate.name, error)
        throw error
      }
    }

    // Running side by side, a write cannot be told apart by gate: each run is guarded against the
    // stage's shared allowlist, which only ever covers `.pikku`.
    const parallel = gatesIn('gate')
    const shared = [...new Set(parallel.flatMap(writesOf))]
    const before = await snapshot(`attempt-${attempt}:snapshot:gate`)
    const settled = await Promise.allSettled(
      parallel.map((gate) => runGate(gate, attempt, before, shared))
    )
    const stopped = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (stopped) throw stopped.reason
    settled.forEach((result, i) =>
      judge(
        parallel[i]!,
        attempt,
        (result as PromiseFulfilledResult<GateOutcome>).value.findings,
        failing
      )
    )
    return failing
  }

  let previousKey: string | undefined
  let feedback: string | undefined
  for (let attempt = 1; ; attempt++) {
    let outcome: AgentOutcome
    try {
      ;({ outcome } = await record(
        `attempt-${attempt}:agent`,
        { attempt },
        () =>
          agent({ attempt, ...(feedback === undefined ? {} : { feedback }) }),
        ({ outcome }) =>
          outcome === 'done'
            ? 'ok'
            : outcome === 'needs-answer'
              ? 'needs-answer'
              : 'fail'
      ))
    } catch (error) {
      // The agent could not run (a provider limit, no binary): not the builder's doing, so no feedback.
      if (error instanceof HarnessInfraError)
        return {
          status: 'infra',
          attempts: attempt,
          feedbackHistory,
          notes,
          infra: infraStop(AGENT, error).infra,
        }
      throw error
    }
    if (outcome !== 'done')
      return { status: outcome, attempts: attempt, feedbackHistory, notes }

    // Gates judge commits: work the agent left uncommitted goes back to it instead.
    let failing: GateFindings[]
    try {
      let uncommitted: string[]
      try {
        uncommitted = await record(
          `attempt-${attempt}:${CLEAN_TREE}`,
          { attempt },
          async () =>
            [...(await snapshotTree(worktree, gitBinary)).keys()]
              .filter((path) => !path.startsWith('.pikku/'))
              .sort(),
          (paths) => (paths.length ? 'fail' : 'ok')
        )
      } catch (error) {
        if (error instanceof HarnessInfraError)
          throw infraStop(CLEAN_TREE, error)
        throw error
      }
      failing = uncommitted.length
        ? [{ gate: CLEAN_TREE, findings: uncommitted.map(uncommittedFinding) }]
        : await runGates(attempt)
    } catch (error) {
      if (error instanceof Stop)
        return {
          status: 'infra',
          attempts: attempt,
          feedbackHistory,
          notes,
          infra: error.infra,
        }
      throw error
    }

    if (!failing.length) {
      await record('markDone', { attempt }, markDone)
      return { status: 'done', attempts: attempt, feedbackHistory, notes }
    }

    const key = failingKey(failing)
    const stop: HarnessStatus | undefined =
      stopOnRepeat && key === previousKey
        ? 'repeated'
        : attempt >= tries
          ? 'gave-up'
          : undefined
    if (stop)
      return {
        status: stop,
        attempts: attempt,
        feedbackHistory,
        notes,
        failing,
      }
    previousKey = key
    feedback = formatFeedback(attempt, failing, feedbackMaxChars)
    feedbackHistory.push(feedback)
  }
}
