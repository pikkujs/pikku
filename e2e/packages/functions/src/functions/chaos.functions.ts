import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import {
  isDependencyDown,
  readEffects,
  recordEffect,
  type ChaosLedgerEntry,
} from './chaos-ledger.js'

const DEFAULT_LEDGER_DIR = '/tmp/pikku-chaos'

const ledgerDir = async (variables: {
  get: (name: string) => Promise<string | undefined> | string | undefined
}): Promise<string> =>
  (await variables.get('CHAOS_LEDGER_DIR')) ?? DEFAULT_LEDGER_DIR

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The shared shape every chaos step accepts.
 *
 * Failure is expressed two ways because they answer different questions.
 * `failAttemptsBelow` is deterministic — it reads the durable `attemptCount`,
 * so a replay reaches the same verdict and the step is a clean model of
 * self-healing flakiness. `dependency` reads an external file switch, so a
 * dependency can be held down across many attempts and healed by hand mid-run,
 * which is the only way to observe a retry succeed for a reason the workflow
 * did not already know at planning time.
 */
export type ChaosInput = {
  /** Ledger key — the identity of the side effect being performed. */
  key: string
  /** Block for this long before returning, to open a window for a kill. */
  delayMs?: number
  /** Fail while the durable attempt count is below this. */
  failAttemptsBelow?: number
  /** Fail on every attempt, forever. */
  failAlways?: boolean
  /** Fail while the file switch `down-<dependency>` exists. */
  dependency?: string
  /** Echoed back in the output, so a workflow can thread a value through. */
  echo?: string
}

export type ChaosOutput = {
  key: string
  attempt: number
  echo?: string
  /** How many times this key's body has run, across every restart. */
  totalEffects: number
}

/**
 * Records a side effect, then optionally stalls and/or fails.
 *
 * The ledger write happens BEFORE the failure check on purpose: a step that
 * fails after touching the world is exactly the case compensation exists for,
 * and recording only successes would hide the double-effect bugs this is
 * meant to catch.
 */
const performEffect = async (
  dir: string,
  data: ChaosInput,
  runId: string,
  invocationId: string | undefined,
  attempt: number
): Promise<ChaosOutput> => {
  recordEffect(dir, {
    key: data.key,
    runId,
    invocationId,
    attempt,
    at: Date.now(),
    detail: data.echo,
  } satisfies ChaosLedgerEntry)

  if (data.delayMs) {
    await wait(data.delayMs)
  }

  if (data.failAlways) {
    throw new Error(`chaos:${data.key} is configured to always fail`)
  }
  if (data.dependency && isDependencyDown(dir, data.dependency)) {
    throw new Error(
      `chaos:${data.key} dependency '${data.dependency}' is down (attempt ${attempt})`
    )
  }
  if (data.failAttemptsBelow && attempt < data.failAttemptsBelow) {
    throw new Error(
      `chaos:${data.key} transient failure on attempt ${attempt} of ${data.failAttemptsBelow}`
    )
  }

  const totalEffects = readEffects(dir).filter((e) => e.key === data.key).length
  return { key: data.key, attempt, echo: data.echo, totalEffects }
}

/**
 * The single configurable work step every chaos workflow is built from.
 *
 * One function rather than a family of near-identical ones: the interesting
 * variable in a reliability test is the *shape of the workflow around* the
 * step, not the step itself, and a single well-known RPC name keeps the graphs
 * comparable.
 */
export const chaosStep = pikkuSessionlessFunc<ChaosInput, ChaosOutput>({
  description:
    'Perform a recorded side effect with injectable delay and failure',
  expose: true,
  func: async ({ variables }, data, { workflowStep }) =>
    performEffect(
      await ledgerDir(variables),
      data,
      workflowStep?.runId ?? 'no-run',
      workflowStep?.invocationId,
      workflowStep?.attemptCount ?? 0
    ),
})

/**
 * The compensating half of a saga pair. Distinct from `chaosStep` only so that
 * `onError` targets read as compensation at the call site and in the graph.
 *
 * `key` is optional because it has to be. A step's `onError` handler is invoked
 * with `{ error: { message } }` and nothing else — not the failed step's input —
 * so when this runs as compensation it cannot be told which entity to undo, and
 * a required `key` makes the handler itself fail schema validation. Called
 * directly through `workflow.do` the caller supplies one, and the run id is the
 * fallback identity for the compensation-fired assertion.
 */
export const chaosCompensate = pikkuSessionlessFunc<
  { key?: string; error?: { message?: string } },
  { compensated: string }
>({
  description: 'Record a compensating action for a failed step',
  expose: true,
  func: async ({ variables }, data, { workflowStep }) => {
    const runId = workflowStep?.runId ?? 'no-run'
    const compensated = data.key ?? `run:${runId}`
    recordEffect(await ledgerDir(variables), {
      key: `compensate:${compensated}`,
      runId,
      invocationId: workflowStep?.invocationId,
      attempt: 0,
      at: Date.now(),
      detail: data.error?.message,
    })
    return { compensated }
  },
})

/** Reads the ledger back, so a test can assert on effects without file access. */
export const chaosReadLedger = pikkuSessionlessFunc<
  { key?: string; runId?: string },
  { entries: ChaosLedgerEntry[]; count: number }
>({
  description: 'Read recorded chaos side effects',
  expose: true,
  func: async ({ variables }, { key, runId }) => {
    const entries = readEffects(await ledgerDir(variables)).filter(
      (e) => (!key || e.key === key) && (!runId || e.runId === runId)
    )
    return { entries, count: entries.length }
  },
})
