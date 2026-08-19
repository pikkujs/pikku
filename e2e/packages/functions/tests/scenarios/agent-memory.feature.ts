/**
 * A thread is the unit of memory: successive runs on the same thread accumulate
 * history that is replayed into later model calls, and both the messages and the
 * runs are persisted so the owner can read them back. These assertions are about
 * storage and replay — the trim semantics are unit-tested separately.
 *
 * The working-memory notepad is the second kind of memory here: the model writes
 * to it in-band with `<working_memory>` blocks, and the next turn only sees them
 * if they were extracted and persisted, because the state is echoed back as a
 * system message. That echo is what the working-memory scenarios assert on —
 * there is no read side exposed over RPC.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AGENT = 'todoReadAgent'
const DELEGATING_AGENT = 'workingMemoryDelegateParentAgent'
const RESOURCE_ID = 'agent-memory'
const ALICE = { userId: 'alice' }

export const agentMemoryReplaysEarlierTurnScenario = pikkuScenario<
  void,
  { replayed: true }
>({
  title: 'A later turn replays the earlier turn’s history to the model',
  description: 'That replay is the whole point of a persisted thread',
  tags: ['scenario', 'agent-protocol', 'agent-memory'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('tells the agent something', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'remember the sky is blue',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const second = await scenario.when('asks it back', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'what did I tell you',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then('sees the earlier turn replayed', 'expectsModelCall', {
      calls: second.ownCalls,
      index: 1,
      messagesInclude: 'remember the sky is blue',
    })
    return { replayed: true }
  },
})

export const agentMemoryPersistsMessagesAndRunsScenario = pikkuScenario<
  void,
  { persisted: true }
>({
  title: 'A run’s messages and run history are persisted for the owner',
  description: 'Both the transcript and the run record survive the request',
  tags: ['scenario', 'agent-protocol', 'agent-memory'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.when('runs a turn with a tool', 'runsAgent', {
      agent: AGENT,
      script: 'tool-then-text',
      message: 'persist this turn',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })

    const messages = await scenario.when(
      'reads the thread messages',
      'callsRpcAs',
      {
        rpcName: 'getAgentThreadMessages',
        data: { threadId: thread.threadId },
        identity: ALICE,
      }
    )
    await scenario.then(
      'sees the turn and its tool message',
      'expectsThreadRecords',
      {
        call: messages,
        contains: 'persist this turn',
        hasRole: 'tool',
      }
    )

    const runs = await scenario.when('reads the thread runs', 'callsRpcAs', {
      rpcName: 'getAgentThreadRuns',
      data: { threadId: thread.threadId },
      identity: ALICE,
    })
    await scenario.then('sees the one run', 'expectsThreadRecords', {
      call: runs,
      count: 1,
    })
    return { persisted: true }
  },
})

/**
 * A delegating parent's own text never reaches the client, but it is still the
 * only place its notepad updates live. Everything it wrote from its first
 * hand-off onward used to be dropped before anything could read it, so the
 * notepad silently stopped accumulating for exactly the agents that delegate.
 */
export const agentMemoryKeepsNotesWrittenAfterHandOffScenario = pikkuScenario<
  void,
  { remembered: true }
>({
  title: 'A delegating parent’s notes written after the hand-off survive',
  description:
    'The parent’s hidden text is still the channel its working memory arrives on',
  tags: ['scenario', 'agent-protocol', 'agent-memory'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('delegates and then takes a note', 'streamsAgent', {
      agent: DELEGATING_AGENT,
      script: 'delegate-then-working-memory',
      message: 'delegate and remember the topic',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const second = await scenario.when('takes another turn', 'runsAgent', {
      agent: DELEGATING_AGENT,
      script: 'text-only',
      message: 'what is the topic',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the note echoed back into the prompt',
      'expectsModelCall',
      {
        calls: second.ownCalls,
        index: 1,
        systemInclude: 'cerulean-9137',
      }
    )
    return { remembered: true }
  },
})

export const agentMemoryKeepsNotesWrittenBeforeHandOffScenario = pikkuScenario<
  void,
  { remembered: true }
>({
  title: 'A delegating parent’s notes written before any hand-off survive',
  description: 'The path that always worked, so the fix cannot over-correct',
  tags: ['scenario', 'agent-protocol', 'agent-memory'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('takes a note without delegating', 'streamsAgent', {
      agent: DELEGATING_AGENT,
      script: 'working-memory-only',
      message: 'remember the topic',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    const second = await scenario.when('takes another turn', 'runsAgent', {
      agent: DELEGATING_AGENT,
      script: 'text-only',
      message: 'what is the topic',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the note echoed back into the prompt',
      'expectsModelCall',
      {
        calls: second.ownCalls,
        index: 1,
        systemInclude: 'vermilion-4412',
      }
    )
    return { remembered: true }
  },
})

export const agentMemoryFeature = pikkuFeature({
  name: 'Thread memory persists and replays',
  description:
    'Successive runs on one thread accumulate history, and both messages and runs are stored',
  tags: ['agent-protocol', 'agent-memory'],
  scenarios: [
    agentMemoryReplaysEarlierTurnScenario,
    agentMemoryPersistsMessagesAndRunsScenario,
    agentMemoryKeepsNotesWrittenAfterHandOffScenario,
    agentMemoryKeepsNotesWrittenBeforeHandOffScenario,
  ],
})
