/**
 * The generated client against the running server: `pikkuRPC.agent.stream` yields
 * the run's events and throws the server's `RUN_ERROR`, and `run`/`approve` hand
 * back `status` and `pendingApprovals` as the server sends them.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const READ_AGENT = 'todoReadAgent'
const TODO_AGENT = 'todoAgent'
const RESOURCE_ID = 'agent-client'
const ALICE = { userId: 'alice' }
const PLAIN_TEXT_REPLY = 'The mock model replied with plain text.'

export const agentClientStreamsTextScenario = pikkuScenario<
  void,
  { streamed: true }
>({
  title: 'The generated client streams a reply as it is written',
  description:
    'agent.stream yields RUN_STARTED, the text deltas, then RUN_FINISHED',
  tags: ['scenario', 'agent-protocol', 'agent-client'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when(
      'streams the agent through the client',
      'streamsAgentThroughClient',
      {
        agent: READ_AGENT,
        script: 'text-only',
        message: 'client stream hello',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    await scenario.then('sees the run envelope', 'expectsStreamEnvelope', {
      types: stream.types,
      startsWith: 'RUN_STARTED',
      endsWith: 'RUN_FINISHED',
    })
    await scenario.then('sees the whole reply', 'expectsClientValue', {
      actual: stream.text,
      equals: PLAIN_TEXT_REPLY,
    })
    return { streamed: true }
  },
})

export const agentClientStreamsApprovalScenario = pikkuScenario<
  void,
  { asked: true }
>({
  title: 'The generated client streams an approval request',
  description:
    'A gated tool reaches the screen as a pikku:approval-request event',
  tags: ['scenario', 'agent-protocol', 'agent-client', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')
    const stream = await scenario.when(
      'streams the todo agent through the client',
      'streamsAgentThroughClient',
      {
        agent: TODO_AGENT,
        script: 'add-todo-then-text',
        message: 'add a todo',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
        identity: ALICE,
      }
    )
    await scenario.then('sees one approval request', 'expectsClientValue', {
      actual: stream.approvalTools.map((name) => name.endsWith('addTodo')),
      equals: [true],
    })
    await scenario.then('sees the run end cleanly', 'expectsStreamEnvelope', {
      types: stream.types,
      startsWith: 'RUN_STARTED',
      endsWith: 'RUN_FINISHED',
    })
    return { asked: true }
  },
})

export const agentClientRunThenApproveScenario = pikkuScenario<
  void,
  { resumed: true }
>({
  title: 'The generated client runs to a suspension and approves it',
  description:
    'agent.run reports status and pendingApprovals; agent.approve resumes',
  tags: ['scenario', 'agent-protocol', 'agent-client', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')
    const run = await scenario.when(
      'runs the todo agent through the client',
      'runsAgentThroughClient',
      {
        agent: TODO_AGENT,
        script: 'add-todo-then-text',
        message: 'add a todo',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
        identity: ALICE,
      }
    )
    await scenario.then('sees the run suspended', 'expectsClientValue', {
      actual: run.status,
      equals: 'suspended',
    })
    await scenario.then('sees the pending call', 'expectsClientValue', {
      actual: run.pendingApprovals.map(({ toolName }) =>
        toolName.endsWith('addTodo')
      ),
      equals: [true],
    })
    const resumed = await scenario.when(
      'approves through the client',
      'approvesThroughClient',
      { agent: TODO_AGENT, run, approved: true, identity: ALICE }
    )
    await scenario.then('sees the run finish', 'expectsClientValue', {
      actual: { status: resumed.status, pending: resumed.pendingApprovals },
      equals: { status: null, pending: [] },
    })
    return { resumed: true }
  },
})

export const agentClientStreamErrorThrowsScenario = pikkuScenario<
  void,
  { thrown: true }
>({
  title: 'The generated client throws a refused stream',
  description:
    'A RUN_ERROR becomes a PikkuAgentStreamError, not an empty result',
  tags: ['scenario', 'agent-protocol', 'agent-client'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when(
      'streams an agent that does not exist through the client',
      'streamsAgentThroughClient',
      {
        agent: 'noSuchAgent',
        script: 'text-only',
        message: 'hello nobody',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    await scenario.then('sees nothing yielded', 'expectsClientValue', {
      actual: stream.types,
      equals: [],
    })
    await scenario.then('sees the error thrown', 'expectsClientValue', {
      actual: Boolean(stream.error),
      equals: true,
    })
    return { thrown: true }
  },
})

export const agentClientFeature = pikkuFeature({
  name: 'AI agent generated client',
  description:
    'pikkuRPC.agent.run, .stream and .approve against the running server',
  tags: ['agent-protocol'],
  scenarios: [
    agentClientStreamsTextScenario,
    agentClientStreamsApprovalScenario,
    agentClientRunThenApproveScenario,
    agentClientStreamErrorThrowsScenario,
  ],
})
