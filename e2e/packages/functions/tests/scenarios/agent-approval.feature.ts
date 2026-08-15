/**
 * A tool declared `approvalRequired` suspends the run when the model calls it:
 * the sync response carries `status: "suspended"` and a `pendingApprovals`
 * entry per call, each with the human-readable reason built by
 * `approvalDescription`. Approving resumes and executes the tool; denying
 * resumes without executing it.
 *
 * These deterministic protocol checks replace the browser-driven console
 * approval scenarios (todo list/deny/batch/delete-reason).
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const AGENT = 'todoAgent'
const RESOURCE_ID = 'agent-approval'
const ALICE = { userId: 'alice' }

export const agentApprovalOutputMiddlewareScenario = pikkuScenario<
  void,
  { uppercased: true }
>({
  title: 'Output middleware uppercases the run result',
  description: 'The agent’s own output middleware runs on the sync route',
  tags: ['scenario', 'agent-protocol', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the todo agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'say something',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then('sees the result uppercased', 'expectsRunResult', {
      run,
      equals: 'THE MOCK MODEL REPLIED WITH PLAIN TEXT.',
    })
    return { uppercased: true }
  },
})

export const agentApprovalSuspendsThenExecutesScenario = pikkuScenario<
  void,
  { executed: true }
>({
  title: 'An approval-gated add suspends with its reason, then executes',
  description: 'Approving resumes the run and the tool actually runs',
  tags: ['scenario', 'agent-protocol', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the todo agent', 'runsAgent', {
      agent: AGENT,
      script: 'add-todo-then-text',
      message: 'add a todo',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees one approval with its reason',
      'expectsApprovalState',
      {
        run,
        suspended: true,
        count: 1,
        reasonContains: 'Add a todo called "Write e2e tests"',
      }
    )

    const resumed = await scenario.when(
      'approves every pending call',
      'resolvesApprovals',
      {
        agent: AGENT,
        runId: run.runId,
        pendingApprovals: run.pendingApprovals,
        approved: true,
        identity: ALICE,
      }
    )
    await scenario.then('sees the run resume', 'expectsApprovalState', {
      run: resumed,
      suspended: false,
    })

    const todos = await scenario.when('reads the todo list', 'callsRpcAs', {
      rpcName: 'todos:listTodos',
      data: {},
    })
    await scenario.then('sees the todo added', 'expectsTodos', {
      call: todos,
      includes: 'Write e2e tests',
    })
    return { executed: true }
  },
})

export const agentApprovalDenialSkipsToolScenario = pikkuScenario<
  void,
  { executed: false }
>({
  title: 'A denied approval resumes without executing the tool',
  description: 'The run finishes but the store is untouched',
  tags: ['scenario', 'agent-protocol', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the todo agent', 'runsAgent', {
      agent: AGENT,
      script: 'add-todo-then-text',
      message: 'add a todo',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then('sees the run suspended', 'expectsApprovalState', {
      run,
      suspended: true,
    })

    const resumed = await scenario.when(
      'denies every pending call',
      'resolvesApprovals',
      {
        agent: AGENT,
        runId: run.runId,
        pendingApprovals: run.pendingApprovals,
        approved: false,
        identity: ALICE,
      }
    )
    await scenario.then('sees the run resume', 'expectsApprovalState', {
      run: resumed,
      suspended: false,
    })

    const todos = await scenario.when('reads the todo list', 'callsRpcAs', {
      rpcName: 'todos:listTodos',
      data: {},
    })
    await scenario.then('sees nothing added', 'expectsTodos', {
      call: todos,
      excludes: 'Write e2e tests',
    })
    return { executed: false }
  },
})

export const agentApprovalDeleteReasonNamesRecordScenario = pikkuScenario<
  void,
  { named: true }
>({
  title: 'A delete approval reason names the target record',
  description: 'The reason is built from the record, not from the tool name',
  tags: ['scenario', 'agent-protocol', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the todo agent', 'runsAgent', {
      agent: AGENT,
      script: 'delete-todo-then-text',
      message: 'delete todo 1',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then(
      'sees the reason name the todo',
      'expectsApprovalState',
      {
        run,
        suspended: true,
        reasonContains: 'Delete the todo called "Buy groceries"',
      }
    )
    return { named: true }
  },
})

export const agentApprovalBatchAllExecuteScenario = pikkuScenario<
  void,
  { executions: 3 }
>({
  title: 'Several approval-gated calls in one turn all suspend and all execute',
  description: 'Every approved call runs, counted off the persisted thread',
  tags: ['scenario', 'agent-protocol', 'agent-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the todo agent', 'runsAgent', {
      agent: AGENT,
      script: 'three-todos-then-text',
      message: 'add three todos',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })
    await scenario.then('sees three approvals', 'expectsApprovalState', {
      run,
      suspended: true,
      count: 3,
    })

    const resumed = await scenario.when(
      'approves every pending call',
      'resolvesApprovals',
      {
        agent: AGENT,
        runId: run.runId,
        pendingApprovals: run.pendingApprovals,
        approved: true,
        identity: ALICE,
      }
    )
    await scenario.then('sees the run resume', 'expectsApprovalState', {
      run: resumed,
      suspended: false,
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
    await scenario.then('sees three tool executions', 'expectsThreadRecords', {
      call: messages,
      toolExecutions: { name: 'todos__addTodo', count: 3 },
    })
    return { executions: 3 }
  },
})

export const agentApprovalFeature = pikkuFeature({
  name: 'Approval-gated tools suspend, resume, and honour the decision',
  description:
    'Approving resumes and executes the tool; denying resumes without executing it',
  tags: ['agent-protocol', 'agent-approval'],
  scenarios: [
    agentApprovalOutputMiddlewareScenario,
    agentApprovalSuspendsThenExecutesScenario,
    agentApprovalDenialSkipsToolScenario,
    agentApprovalDeleteReasonNamesRecordScenario,
    agentApprovalBatchAllExecuteScenario,
  ],
})
