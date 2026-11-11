/**
 * What a run's trace looks like from outside: the chaos ledger records the
 * trace every effect ran on, so a scenario reads the effects back rather than
 * trusting what the run says about itself.
 */
import {
  pikkuScenarioStep,
  pollUntil,
  postScenarioJson,
  requireScenarioEnv,
} from '#pikku/scenario'

type Effect = {
  key: string
  runId: string
  attempt: number
  traceId?: string
  spanId?: string
}

const readEffects = async (apiUrl: string, filter: object) => {
  const response = await postScenarioJson<{ entries: Effect[] }>(
    `${apiUrl}/rpc/chaosReadLedger`,
    { body: { data: filter } }
  )
  return response.body?.entries ?? []
}

const assertOneTrace = (effects: Effect[], traceId?: string): string => {
  const traces = new Set(effects.map((effect) => effect.traceId))
  if (traces.size !== 1) {
    throw new Error(
      `Expected one trace, saw ${JSON.stringify(effects, null, 1)}`
    )
  }
  const [seen] = traces
  if (!seen || !/^[0-9a-f]{32}$/.test(seen)) {
    throw new Error(`Expected a W3C trace id, got ${seen}`)
  }
  if (traceId && seen !== traceId) {
    throw new Error(`Expected trace ${traceId}, the effects ran on ${seen}`)
  }
  const spans = effects.map((effect) => effect.spanId)
  if (new Set(spans).size !== spans.length) {
    throw new Error(`Hops share a span: ${JSON.stringify(effects, null, 1)}`)
  }
  return seen
}

export const expectsEffectsOnOneTrace = pikkuScenarioStep<
  {
    keyContains?: string
    runId?: string
    keys?: string[]
    traceId?: string
    minimumEffects?: number
  },
  { traceId: string; effects: number }
>({
  name: 'expectsEffectsOnOneTrace',
  description: 'expects every recorded effect to share one trace',
  template: 'expects the effects to share one trace',
  default: async (
    _services,
    { keyContains, runId, keys, traceId, minimumEffects },
    { scenarioStep }
  ) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const filter = { keyContains, runId }
    let last: Effect[] = []
    const effects = await pollUntil(
      async () => {
        last = await readEffects(apiUrl, filter)
        const seen = new Set(last.map((effect) => effect.key))
        const complete =
          (keys ?? []).every((key) => seen.has(key)) &&
          last.length >= (minimumEffects ?? 1)
        return complete ? last : undefined
      },
      { timeoutMs: 30_000, intervalMs: 100 }
    )
    if (!effects) {
      throw new Error(`Effects never arrived: ${JSON.stringify(last, null, 1)}`)
    }
    return {
      traceId: assertOneTrace(effects, traceId),
      effects: effects.length,
    }
  },
})

export const requestsTraceChain = pikkuScenarioStep<
  { tag: string },
  { traceId: string }
>({
  name: 'requestsTraceChain',
  description: 'sends the request that sets off a job and a workflow',
  template: 'requests the trace chain',
  default: async (_services, { tag }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const response = await postScenarioJson<{ traceId?: string }>(
      `${apiUrl}/rpc/chaosTraceKickoff`,
      { body: { data: { tag } } }
    )
    if (!response.body?.traceId) {
      throw new Error(`The request reported no trace: ${response.serialized}`)
    }
    return { traceId: response.body.traceId }
  },
})

export const approvesWorkflowGate = pikkuScenarioStep<
  { run: { workflowName: string; runId?: string }; reason: string },
  { approved: true }
>({
  name: 'approvesWorkflowGate',
  description: 'answers a workflow approval gate over HTTP',
  template: 'approves the gate',
  default: async (_services, { run, reason }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const answered = await pollUntil(
      async () => {
        const response = await postScenarioJson(
          `${apiUrl}/workflow/${run.workflowName}/approve/${run.runId}`,
          {
            headers: { 'x-user-id': 'workflow-approver' },
            body: {
              reason,
              decision: { approved: true, reviewer: 'manager' },
            },
          }
        )
        return response.status < 300 ? true : undefined
      },
      { timeoutMs: 15_000, intervalMs: 200 }
    )
    if (!answered) throw new Error(`The gate '${reason}' never opened`)
    return { approved: true }
  },
})
