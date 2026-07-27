/**
 * Authorization on agent tools splits in two, and the split is the contract:
 *
 * - `pikkuAuth` depends only on the session, so it can be evaluated before the
 *   run starts. A tool the caller fails is filtered out of the list and the
 *   model is never told it exists.
 * - `pikkuPermission` depends on request data, which does not exist until the
 *   model actually calls the tool. Such a tool is still offered; the gate runs
 *   on invocation instead.
 *
 * Auth narrows the menu, permissions guard the call. Asserting the first via
 * the offered tool list matters because a tool that is absent cannot be called
 * by any model, cooperative or not.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const RESOURCE_ID = 'agent-security'
const PLAIN_TEXT_REPLY = 'The mock model replied with plain text.'

export const agentPermissionsAuthGatedToolIsNeverOfferedScenario =
  pikkuScenario<void, { offered: string[] }>({
    title: 'An auth-gated tool the caller fails is never offered',
    description:
      'A caller who fails a tool’s pikkuAuth never sees it in the menu',
    tags: ['scenario', 'agent-protocol', 'agent-permissions'],
    func: async (_services, _data, { scenario }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when(
        'runs permissionsAgent as an outsider',
        'runsAgent',
        {
          agent: 'permissionsAgent',
          script: 'text-only',
          message: 'what can you do',
          threadId: thread.threadId,
          resourceId: RESOURCE_ID,
          identity: { userId: 'outsider' },
        }
      )
      const offered = await scenario.then(
        'sees openTool offered but not gatedTool',
        'expectsOfferedTools',
        {
          calls: run.ownCalls,
          index: 1,
          offered: ['openTool'],
          notOffered: ['gatedTool'],
        }
      )
      return { offered: offered.toolNames }
    },
  })

export const agentPermissionsAuthGatedToolIsOfferedToPasserScenario =
  pikkuScenario<void, { offered: string[] }>({
    title: 'The same tool is offered to a caller who passes its auth check',
    description: 'The gate is the caller, not the tool',
    tags: ['scenario', 'agent-protocol', 'agent-permissions'],
    func: async (_services, _data, { scenario }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when(
        'runs permissionsAgent as a permitted user',
        'runsAgent',
        {
          agent: 'permissionsAgent',
          script: 'text-only',
          message: 'what can I use',
          threadId: thread.threadId,
          resourceId: RESOURCE_ID,
          identity: { userId: 'permitted-user' },
        }
      )
      const offered = await scenario.then(
        'sees both tools offered',
        'expectsOfferedTools',
        {
          calls: run.ownCalls,
          index: 1,
          offered: ['openTool', 'gatedTool'],
        }
      )
      return { offered: offered.toolNames }
    },
  })

/**
 * The two runs need a thread each.
 *
 * The cucumber version put both on one thread, so the outsider's run was
 * refused outright with `Not authorized to access this thread` — and its
 * assertion, `expect(calls[0]?.toolNames ?? []).not.toContain('gatedTool')`,
 * passed vacuously over the empty list. It was green while testing nothing.
 * A menu cached across callers would be cached per agent, not per thread, so
 * one thread each exercises the claim the title makes; thread ownership itself
 * is what the agent-ownership scenarios are for.
 */
export const agentPermissionsFilteringIsPerRunScenario = pikkuScenario<
  void,
  { runs: 2 }
>({
  title: 'Filtering is re-evaluated per run rather than cached',
  description:
    'Two runs by different callers, and the second must not inherit the first’s menu',
  tags: ['scenario', 'agent-protocol', 'agent-permissions'],
  func: async (_services, _data, { scenario }) => {
    const permittedThread = await scenario.given(
      'opens a thread for the permitted user',
      'startsAgentThread'
    )
    const outsiderThread = await scenario.given(
      'opens a thread for the outsider',
      'startsAgentThread'
    )
    const permitted = await scenario.when(
      'runs first as the permitted user',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'text-only',
        message: 'first as permitted',
        threadId: permittedThread.threadId,
        resourceId: RESOURCE_ID,
        identity: { userId: 'permitted-user' },
      }
    )
    const outsider = await scenario.when(
      'runs again as the outsider',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'text-only',
        message: 'then as outsider',
        threadId: outsiderThread.threadId,
        resourceId: RESOURCE_ID,
        identity: { userId: 'outsider' },
      }
    )
    await scenario.then(
      'sees gatedTool offered to the permitted run',
      'expectsOfferedTools',
      { calls: permitted.ownCalls, index: 1, offered: ['gatedTool'] }
    )
    await scenario.then(
      'sees gatedTool withheld from the outsider run',
      'expectsOfferedTools',
      { calls: outsider.ownCalls, index: 1, notOffered: ['gatedTool'] }
    )
    return { runs: 2 }
  },
})

/**
 * The cucumber version of this signed in as the seeded guest before calling,
 * so it never actually tested a sessionless caller. This one sends no identity
 * headers and no cookie at all, which is what the title always claimed.
 */
export const agentPermissionsSessionlessCallerScenario = pikkuScenario<
  void,
  { offered: string[] }
>({
  title: 'A sessionless caller is offered no auth-gated tools',
  description:
    'No cookie and no identity header — the auth gate has nothing to pass',
  tags: ['scenario', 'agent-protocol', 'agent-permissions'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when(
      'runs permissionsAgent with no session',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'text-only',
        message: 'anonymous ask',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    const offered = await scenario.then(
      'sees openTool offered but not gatedTool',
      'expectsOfferedTools',
      {
        calls: run.ownCalls,
        index: 1,
        offered: ['openTool'],
        notOffered: ['gatedTool'],
      }
    )
    return { offered: offered.toolNames }
  },
})

export const agentPermissionsFullyFilteredAgentStillRunsScenario =
  pikkuScenario<void, { offered: 0 }>({
    title: 'An agent whose every tool is filtered away still runs',
    description: 'An empty menu is a menu, not an error',
    tags: ['scenario', 'agent-protocol', 'agent-permissions'],
    func: async (_services, _data, { scenario }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when(
        'runs gatedOnlyAgent as an outsider',
        'runsAgent',
        {
          agent: 'gatedOnlyAgent',
          script: 'text-only',
          message: 'nothing left',
          threadId: thread.threadId,
          resourceId: RESOURCE_ID,
          identity: { userId: 'outsider' },
        }
      )
      await scenario.then('sees the plain reply', 'expectsRunResult', {
        run,
        equals: PLAIN_TEXT_REPLY,
      })
      await scenario.then('sees an empty menu', 'expectsOfferedTools', {
        calls: run.ownCalls,
        index: 1,
        none: true,
      })
      return { offered: 0 }
    },
  })

export const agentPermissionsDataGatedToolIsOfferedScenario = pikkuScenario<
  void,
  { offered: string[] }
>({
  title: 'A data-dependent permission cannot filter, so its tool is offered',
  description:
    'The gate needs request data that does not exist until the model calls the tool',
  tags: ['scenario', 'agent-protocol', 'agent-permissions'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when(
      'runs permissionsAgent as an outsider',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'text-only',
        message: 'data gated menu',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
        identity: { userId: 'outsider' },
      }
    )
    const offered = await scenario.then(
      'sees dataGatedTool offered anyway',
      'expectsOfferedTools',
      { calls: run.ownCalls, index: 1, offered: ['dataGatedTool'] }
    )
    return { offered: offered.toolNames }
  },
})

export const agentPermissionsDataGatedToolIsEnforcedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A data-dependent permission is enforced when the tool is invoked',
  description: 'Offered is not allowed — the gate runs on the call',
  tags: ['scenario', 'agent-protocol', 'agent-permissions'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when(
      'reaches for a record the caller does not own',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'data-gated-foreign-owner',
        message: 'reach for a foreign record',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
        identity: { userId: 'permitted-user' },
      }
    )
    await scenario.then('sees the tool call refused', 'expectsToolResults', {
      calls: run.ownCalls,
      failed: true,
    })
    return { refused: true }
  },
})

export const agentPermissionsDataGatedToolOnOwnRecordScenario = pikkuScenario<
  void,
  { refused: false }
>({
  title: 'The same tool succeeds on a record the caller does own',
  description:
    'The paired success run, which is what proves the refusal came from the gate',
  tags: ['scenario', 'agent-protocol', 'agent-permissions'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when(
      'reaches for a record the caller owns',
      'runsAgent',
      {
        agent: 'permissionsAgent',
        script: 'data-gated-own-record',
        message: 'reach for my own record',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
        identity: { userId: 'permitted-user' },
      }
    )
    await scenario.then('sees the tool call succeed', 'expectsToolResults', {
      calls: run.ownCalls,
      failed: false,
    })
    return { refused: false }
  },
})

export const agentPermissionsAgentRefusesUnpermittedCallerScenario =
  pikkuScenario<void, { modelCalls: 0 }>({
    title:
      'An agent’s own permission refuses an unpermitted caller before it runs',
    description: 'The refusal costs no model call at all',
    tags: ['scenario', 'agent-protocol', 'agent-permissions'],
    func: async (_services, _data, { scenario }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when(
        'runs restrictedAgent as an outsider',
        'runsAgent',
        {
          agent: 'restrictedAgent',
          script: 'text-only',
          message: 'let me in',
          threadId: thread.threadId,
          resourceId: RESOURCE_ID,
          identity: { userId: 'outsider' },
        }
      )
      await scenario.then('sees the run refused', 'expectsRunOutcome', {
        run,
        refused: true,
      })
      await scenario.then('sees no model call', 'expectsModelCallCount', {
        calls: run.modelCalls,
        count: 0,
      })
      return { modelCalls: 0 }
    },
  })

export const agentPermissionsAgentRunsForPermittedCallerScenario =
  pikkuScenario<void, { refused: false }>({
    title: 'The same agent runs for a permitted caller',
    description:
      'The paired success run, which is what proves the refusal came from the permission',
    tags: ['scenario', 'agent-protocol', 'agent-permissions'],
    func: async (_services, _data, { scenario }) => {
      const thread = await scenario.given('opens a thread', 'startsAgentThread')
      const run = await scenario.when(
        'runs restrictedAgent as a permitted user',
        'runsAgent',
        {
          agent: 'restrictedAgent',
          script: 'text-only',
          message: 'i belong here',
          threadId: thread.threadId,
          resourceId: RESOURCE_ID,
          identity: { userId: 'permitted-user' },
        }
      )
      await scenario.then('sees the run succeed', 'expectsRunOutcome', {
        run,
        refused: false,
      })
      await scenario.then('sees the plain reply', 'expectsRunResult', {
        run,
        equals: PLAIN_TEXT_REPLY,
      })
      return { refused: false }
    },
  })

export const agentPermissionsFeature = pikkuFeature({
  name: 'Permission filtering of an agent’s tools',
  description:
    'Auth narrows the tool menu before the run; permissions guard the call once the model reaches for one',
  tags: ['agent-protocol', 'agent-permissions'],
  scenarios: [
    agentPermissionsAuthGatedToolIsNeverOfferedScenario,
    agentPermissionsAuthGatedToolIsOfferedToPasserScenario,
    agentPermissionsFilteringIsPerRunScenario,
    agentPermissionsSessionlessCallerScenario,
    agentPermissionsFullyFilteredAgentStillRunsScenario,
    agentPermissionsDataGatedToolIsOfferedScenario,
    agentPermissionsDataGatedToolIsEnforcedScenario,
    agentPermissionsDataGatedToolOnOwnRecordScenario,
    agentPermissionsAgentRefusesUnpermittedCallerScenario,
    agentPermissionsAgentRunsForPermittedCallerScenario,
  ],
})
