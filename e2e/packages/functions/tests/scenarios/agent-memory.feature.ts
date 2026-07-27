/**
 * A thread is the unit of memory: successive runs on the same thread accumulate
 * history that is replayed into later model calls, and both the messages and the
 * runs are persisted so the owner can read them back. These assertions are about
 * storage and replay — the merge/trim semantics are unit-tested separately.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const AGENT = 'todoReadAgent'
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

export const agentMemoryFeature = pikkuFeature({
  name: 'Thread memory persists and replays',
  description:
    'Successive runs on one thread accumulate history, and both messages and runs are stored',
  tags: ['agent-protocol', 'agent-memory'],
  scenarios: [
    agentMemoryReplaysEarlierTurnScenario,
    agentMemoryPersistsMessagesAndRunsScenario,
  ],
})
