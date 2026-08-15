/**
 * These scenarios pin behaviour that is arguably wrong, so that any change to it
 * is loud rather than silent. They are not endorsements — each is a place the
 * loop swallows a condition a caller might reasonably expect to surface.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const RESOURCE_ID = 'agent-security'
const ALICE = { userId: 'alice' }

/**
 * budgetAgent has maxSteps:1. The script calls a tool on step 1 and would answer
 * on step 2, but the budget is spent first — so the run ends after the tool call
 * with an empty result and no flag or event saying it was truncated.
 */
export const agentKnownGapMaxStepsIsSilentScenario = pikkuScenario<
  void,
  { calls: 1 }
>({
  title: 'maxSteps exhaustion ends the loop with no signal',
  description:
    'A truncated run is indistinguishable from one that had nothing to say',
  tags: ['scenario', 'agent-protocol', 'agent-known-gap'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the budgeted agent', 'runsAgent', {
      agent: 'budgetAgent',
      script: 'open-tool-then-text',
      message: 'budget',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the run reported as a success',
      'expectsRunOutcome',
      {
        run,
        refused: false,
      }
    )
    await scenario.then('sees an empty result', 'expectsRunResult', {
      run,
      equals: '',
    })
    await scenario.then(
      'sees the one model call it afforded',
      'expectsModelCallCount',
      {
        calls: run.ownCalls,
        count: 1,
      }
    )
    return { calls: 1 }
  },
})

/**
 * prepareStopAgent calls stop() before the first step. The loop breaks before any
 * model call, and the run still reports success with an empty result — nothing
 * distinguishes it from an agent that genuinely had nothing to say.
 */
export const agentKnownGapPrepareStopIsSilentScenario = pikkuScenario<
  void,
  { calls: 0 }
>({
  title: 'prepareStep stop() ends the run with no signal',
  description:
    'The loop breaks before any model call and still reports success',
  tags: ['scenario', 'agent-protocol', 'agent-known-gap'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the stopping agent', 'runsAgent', {
      agent: 'prepareStopAgent',
      script: 'text-only',
      message: 'stop me',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the run reported as a success',
      'expectsRunOutcome',
      {
        run,
        refused: false,
      }
    )
    await scenario.then('sees an empty result', 'expectsRunResult', {
      run,
      equals: '',
    })
    await scenario.then('sees no model call at all', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 0,
    })
    return { calls: 0 }
  },
})

/**
 * missingRpcAgent lists a tool whose RPC does not exist. Rather than suspending
 * the run with the missing name before any model call, the tool is simply omitted
 * from the offered list and the run proceeds as if it were never asked for.
 */
export const agentKnownGapUnresolvableToolIsDroppedScenario = pikkuScenario<
  void,
  { offered: 0 }
>({
  title: 'An unresolvable tool is dropped silently rather than suspending',
  description: 'The missing name never reaches the caller',
  tags: ['scenario', 'agent-protocol', 'agent-known-gap'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: 'missingRpcAgent',
      script: 'text-only',
      message: 'resolve me',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the run reported as a success',
      'expectsRunOutcome',
      {
        run,
        refused: false,
      }
    )
    await scenario.then('sees an empty menu', 'expectsOfferedTools', {
      calls: run.ownCalls,
      index: 1,
      none: true,
    })
    await scenario.then('sees one model call', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 1,
    })
    return { offered: 0 }
  },
})

export const agentKnownGapsFeature = pikkuFeature({
  name: 'Current agent behaviour that is a known gap',
  description:
    'Places the loop swallows a condition a caller might reasonably expect to surface',
  tags: ['agent-protocol', 'agent-known-gap'],
  scenarios: [
    agentKnownGapMaxStepsIsSilentScenario,
    agentKnownGapPrepareStopIsSilentScenario,
    agentKnownGapUnresolvableToolIsDroppedScenario,
  ],
})
