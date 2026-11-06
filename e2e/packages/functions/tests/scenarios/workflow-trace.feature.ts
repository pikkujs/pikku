/**
 * One trace across everything a request sets off. The ledger holds the trace id
 * each effect ran on, read through HTTP like any other client.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const unique = () => globalThis.crypto.randomUUID().slice(0, 8)

export const httpJobWorkflowTraceScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'A request, its job and the workflow it starts share one trace',
  description:
    'HTTP enqueues a job, the job starts a run, and the run retries, sleeps, enqueues a job and starts a child',
  tags: ['scenario', 'workflow', 'trace'],
  func: async (_services, _data, { scenario }) => {
    const tag = unique()
    const kicked = await scenario.when(
      'the request enqueues a job',
      'requestsTraceChain',
      { tag }
    )
    await scenario.then(
      'every hop is on its trace',
      'expectsEffectsOnOneTrace',
      {
        keyContains: tag,
        traceId: kicked.traceId,
        // The flaky step records both attempts, each in its own span.
        minimumEffects: 7,
        keys: [
          `job:${tag}`,
          `first:${tag}`,
          `flaky:${tag}`,
          `step-job:${tag}`,
          `child:${tag}`,
          `child-two:${tag}`,
        ],
      }
    )
    return { completed: true }
  },
})

export const sagaTraceScenario = pikkuScenario<void, { completed: true }>({
  title: 'A saga stays on one trace through retries and compensation',
  description: 'The payment step fails for good and compensation runs',
  tags: ['scenario', 'workflow', 'trace'],
  func: async (_services, _data, { scenario }) => {
    const orderId = unique()
    const started = await scenario.when('starts the saga', 'startsWorkflow', {
      workflowName: 'chaosOrderSagaWorkflow',
      input: { orderId, paymentFatal: true },
    })
    const run = await scenario.then('the saga ends', 'awaitsWorkflowRun', {
      run: started,
      timeoutMs: 20_000,
    })
    await scenario.then('it was compensated', 'expectsWorkflowOutcome', {
      run,
      outcome: 'compensated',
    })
    await scenario.then(
      'every hop is on one trace',
      'expectsEffectsOnOneTrace',
      {
        runId: started.runId,
        keys: [
          `reserve:${orderId}`,
          `charge:${orderId}`,
          `undo:reserve:${orderId}`,
        ],
      }
    )
    return { completed: true }
  },
})

export const fanoutTraceScenario = pikkuScenario<void, { completed: true }>({
  title: 'A fan-out stays on one trace, poisoned sibling included',
  description: 'Concurrent shards run and one of them keeps failing',
  tags: ['scenario', 'workflow', 'trace'],
  func: async (_services, _data, { scenario }) => {
    const batchId = unique()
    const started = await scenario.when(
      'starts the fan-out',
      'startsWorkflow',
      {
        workflowName: 'chaosFanoutWorkflow',
        input: { batchId, shards: 4, poisonShard: 2, shardRetries: 1 },
      }
    )
    await scenario.then('the run ends', 'awaitsWorkflowRun', {
      run: started,
      timeoutMs: 20_000,
    })
    await scenario.then(
      'every shard is on one trace',
      'expectsEffectsOnOneTrace',
      {
        runId: started.runId,
        minimumEffects: 4,
      }
    )
    return { completed: true }
  },
})

export const onboardingTraceScenario = pikkuScenario<void, { completed: true }>(
  {
    title: 'A run stays on one trace across a sleep and an approval',
    description: 'The run sleeps, waits at a gate, and resumes when approved',
    tags: ['scenario', 'workflow', 'trace'],
    func: async (_services, _data, { scenario }) => {
      const employeeId = unique()
      const started = await scenario.when(
        'starts the onboarding',
        'startsWorkflow',
        {
          workflowName: 'chaosOnboardingWorkflow',
          input: { employeeId, settleFor: '100ms' },
        }
      )
      await scenario.then('the manager approves', 'approvesWorkflowGate', {
        run: started,
        reason: `Manager sign-off for ${employeeId}`,
      })
      const run = await scenario.then('the run ends', 'awaitsWorkflowRun', {
        run: started,
      })
      await scenario.then('it completed', 'expectsWorkflowOutcome', {
        run,
        outcome: 'completed',
      })
      await scenario.then(
        'every hop is on one trace',
        'expectsEffectsOnOneTrace',
        {
          runId: started.runId,
          keys: [
            `account:${employeeId}`,
            `laptop:${employeeId}`,
            `access:${employeeId}`,
          ],
        }
      )
      return { completed: true }
    },
  }
)

export const workflowTraceFeature = pikkuFeature({
  name: 'Workflow trace',
  description: 'One trace through jobs, runs, retries, sleeps and children',
  tags: ['workflow', 'trace'],
  scenarios: [
    httpJobWorkflowTraceScenario,
    sagaTraceScenario,
    fanoutTraceScenario,
    onboardingTraceScenario,
  ],
})
