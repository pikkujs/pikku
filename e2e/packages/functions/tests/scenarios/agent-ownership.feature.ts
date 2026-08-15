/**
 * A thread belongs to the session that created it. The four thread-management
 * RPCs (getAgentThreadMessages, getAgentThreadRuns, deleteAgentThread and the
 * listing getAgentThreads) are keyed by a caller-supplied threadId, so they must
 * derive the owner from the session and refuse anyone else — a caller cannot read
 * or delete another principal's conversation just by knowing its id.
 *
 * Two properties are load-bearing and asserted separately:
 *
 * - The refusal is a ForbiddenError that does NOT echo the threadId back. Quoting
 *   the id would confirm the thread exists, turning the guard into an existence
 *   oracle.
 * - The owner is the session principal, not the caller-supplied resourceId. A
 *   caller who forges the resourceId of the real owner is still refused, because
 *   the principal prefix it cannot mint is what the check compares.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const RESOURCE_ID = 'agent-security'
const ALICE = { userId: 'alice' }
const MALLORY = { userId: 'mallory' }

export const agentOwnershipOwnerReadsHerThreadScenario = pikkuScenario<
  void,
  { read: true }
>({
  title: 'The owner can read her own thread messages',
  description: 'The guard admits the principal that created the thread',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed alices thread',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const call = await scenario.when('alice reads her messages', 'callsRpcAs', {
      rpcName: 'getAgentThreadMessages',
      data: { threadId: thread.threadId },
      identity: ALICE,
    })
    await scenario.then('sees the read succeed', 'expectsRpcOutcome', {
      call,
      refused: false,
    })
    return { read: true }
  },
})

export const agentOwnershipForeignReadIsRefusedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A foreign caller cannot read the thread’s messages',
  description: 'And the refusal does not echo the id back',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed for a foreign read',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const call = await scenario.when(
      'mallory reads alice’s messages',
      'callsRpcAs',
      {
        rpcName: 'getAgentThreadMessages',
        data: { threadId: thread.threadId },
        identity: MALLORY,
      }
    )
    await scenario.then('sees the read refused', 'expectsRpcOutcome', {
      call,
      refused: true,
      doesNotEcho: thread.threadId,
    })
    return { refused: true }
  },
})

export const agentOwnershipForeignRunsReadIsRefusedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A foreign caller cannot read the thread’s runs',
  description: 'The same guard covers the run listing',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed for a foreign runs read',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const call = await scenario.when('mallory reads the runs', 'callsRpcAs', {
      rpcName: 'getAgentThreadRuns',
      data: { threadId: thread.threadId },
      identity: MALLORY,
    })
    await scenario.then('sees the read refused', 'expectsRpcOutcome', {
      call,
      refused: true,
      doesNotEcho: thread.threadId,
    })
    return { refused: true }
  },
})

export const agentOwnershipForeignDeleteIsRefusedScenario = pikkuScenario<
  void,
  { survived: true }
>({
  title: 'A foreign caller cannot delete the thread',
  description: 'And the owner’s own read still works afterwards',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed for a foreign delete',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const deletion = await scenario.when(
      'mallory deletes the thread',
      'callsRpcAs',
      {
        rpcName: 'deleteAgentThread',
        data: { threadId: thread.threadId },
        identity: MALLORY,
      }
    )
    const read = await scenario.when('alice reads it again', 'callsRpcAs', {
      rpcName: 'getAgentThreadMessages',
      data: { threadId: thread.threadId },
      identity: ALICE,
    })
    await scenario.then('sees the delete refused', 'expectsRpcOutcome', {
      call: deletion,
      refused: true,
      doesNotEcho: thread.threadId,
    })
    await scenario.then('sees the thread still there', 'expectsRpcOutcome', {
      call: read,
      refused: false,
    })
    return { survived: true }
  },
})

export const agentOwnershipForgedResourceIsRefusedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A forged resourceId does not let a foreign caller in',
  description:
    'The owner is the session principal, not the resourceId the caller supplies',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed for a forged resource read',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const call = await scenario.when(
      'mallory reads it claiming alice’s resource',
      'callsRpcAs',
      {
        rpcName: 'getAgentThreadMessages',
        data: { threadId: thread.threadId, resourceId: RESOURCE_ID },
        identity: MALLORY,
      }
    )
    await scenario.then('sees the read refused', 'expectsRpcOutcome', {
      call,
      refused: true,
      doesNotEcho: thread.threadId,
    })
    return { refused: true }
  },
})

export const agentOwnershipListingIsScopedToOwnerScenario = pikkuScenario<
  void,
  { scoped: true }
>({
  title: 'The owner sees her thread when listing, a foreign caller does not',
  description: 'The listing is scoped by the same principal as the reads',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('alice seeds the thread', 'runsAgent', {
      agent: 'todoReadAgent',
      script: 'text-only',
      message: 'seed for a listing',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const alicesListing = await scenario.when(
      'alice lists her threads',
      'callsRpcAs',
      { rpcName: 'getAgentThreads', data: {}, identity: ALICE }
    )
    const mallorysListing = await scenario.when(
      'mallory lists her threads',
      'callsRpcAs',
      { rpcName: 'getAgentThreads', data: {}, identity: MALLORY }
    )
    await scenario.then('sees alice’s own thread listed', 'expectsListedIds', {
      call: alicesListing,
      includes: thread.threadId,
    })
    await scenario.then('sees it withheld from mallory', 'expectsListedIds', {
      call: mallorysListing,
      excludes: thread.threadId,
    })
    return { scoped: true }
  },
})

export const agentOwnershipOrgScopeRefusesOrglessScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'An org-scoped agent refuses a caller with no organization',
  description: 'There is no org to scope the session to',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs orgScopeAgent orgless', 'runsAgent', {
      agent: 'orgScopeAgent',
      script: 'text-only',
      message: 'let me in without an org',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: { userId: 'orgless-user' },
    })
    await scenario.then('sees the run refused', 'expectsRunOutcome', {
      run,
      refused: true,
    })
    return { refused: true }
  },
})

export const agentOwnershipOrgScopeAdmitsOrgMemberScenario = pikkuScenario<
  void,
  { refused: false }
>({
  title: 'An org-scoped agent runs for a caller that has an organization',
  description:
    'The paired success run, which is what proves the refusal is the org',
  tags: ['scenario', 'agent-protocol', 'agent-ownership'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs orgScopeAgent as acme', 'runsAgent', {
      agent: 'orgScopeAgent',
      script: 'text-only',
      message: 'i have an org',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: { userId: 'org-member', orgId: 'acme' },
    })
    await scenario.then('sees the run succeed', 'expectsRunOutcome', {
      run,
      refused: false,
    })
    return { refused: false }
  },
})

export const agentOwnershipFeature = pikkuFeature({
  name: 'Ownership of an agent’s threads',
  description:
    'A thread belongs to the session that created it, and the refusal never confirms it exists',
  tags: ['agent-protocol', 'agent-ownership'],
  scenarios: [
    agentOwnershipOwnerReadsHerThreadScenario,
    agentOwnershipForeignReadIsRefusedScenario,
    agentOwnershipForeignRunsReadIsRefusedScenario,
    agentOwnershipForeignDeleteIsRefusedScenario,
    agentOwnershipForgedResourceIsRefusedScenario,
    agentOwnershipListingIsScopedToOwnerScenario,
    agentOwnershipOrgScopeRefusesOrglessScenario,
    agentOwnershipOrgScopeAdmitsOrgMemberScenario,
  ],
})
