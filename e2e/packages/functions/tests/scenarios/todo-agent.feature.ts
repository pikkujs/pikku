/**
 * The todo agent, driven through the console's playground.
 *
 * The list / deny / batch-approve-all / delete-reason behaviours were retired
 * from here once the deterministic `agent-approval` suite covered the same
 * suspend/approve/deny/reason protocol without a browser or a live model. What
 * remains is assistant-ui interaction a protocol test cannot see: the approval
 * card as it renders, mixed approve/deny across several cards in one turn, and
 * a full multi-turn conversation typed into the composer.
 *
 * These run against a REAL model. What is being asserted is that the agent
 * turned an English request into the right tool call with the right arguments —
 * a decision a scripted mock would be making on its behalf. They are tagged
 * `ai-live` and are held out of the default console run.
 *
 * The uppercase replies are the project's own AI middleware, not a quirk of the
 * model, so they are safe to assert on exactly.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const TODO_AGENT = 'todoAgent'

export const todoAgentAddApprovedScenario = pikkuScenario<
  void,
  { added: true }
>({
  title: 'Adding a todo shows why, and the reply comes back uppercased',
  description:
    'The approval card explains the call it wants, and approving it lets the run finish',
  tags: ['scenario', 'todo-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the todo agent playground',
      'opensAgentPlayground',
      { agent: TODO_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for a todo to be added',
      'sendsAgentMessage',
      { message: "Add a todo called 'Write e2e tests'" },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the call',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the action',
      'expectsApprovalReason',
      { containing: 'Add a todo called' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the todo',
      'expectsApprovalReason',
      { containing: 'Write e2e tests' },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves it',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the uppercased confirmation',
      'seesInChat',
      { text: 'WRITE E2E TESTS', caseSensitive: true },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees no empty assistant messages',
      'expectsNoEmptyAssistantBlocks',
      undefined,
      { actor: actors.admin }
    )

    return { added: true }
  },
})

/**
 * Three requests raised in one turn, answered differently.
 *
 * This is the case a protocol test cannot reach: the console has to keep three
 * cards apart, answer each one independently, and leave two resolved approved
 * and one denied.
 */
export const todoAgentMixedApprovalsScenario = pikkuScenario<
  void,
  { approved: number; denied: number }
>({
  title: 'Three requests in one turn, two approved and one denied',
  description:
    'Several approval cards in a single turn are answered independently',
  tags: ['scenario', 'todo-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the todo agent playground',
      'opensAgentPlayground',
      { agent: TODO_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for three todos at once',
      'sendsAgentMessage',
      {
        message:
          "Create these 3 todos: 'Learn to juggle', 'Eat a cloud', 'Befriend a squirrel'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve three calls',
      'seesApprovalRequests',
      { count: 3 },
      { actor: actors.admin }
    )
    await scenario.when(
      'denies the second and approves the rest',
      'deniesNthApprovesRest',
      { nth: 2 },
      { actor: actors.admin }
    )
    const outcomes = await scenario.then(
      'sees two approved and one denied',
      'expectsApprovalOutcomes',
      { approved: 2, denied: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the first approved todo',
      'seesInChat',
      { text: 'Learn to juggle' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the third approved todo',
      'seesInChat',
      { text: 'Befriend a squirrel' },
      { actor: actors.admin }
    )

    return outcomes
  },
})

export const todoAgentDeleteReasonScenario = pikkuScenario<
  void,
  { deleted: true }
>({
  title: 'Deleting a todo explains which record it means',
  description:
    'The approval reason names the record itself, not just the operation',
  tags: ['scenario', 'todo-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the todo agent playground',
      'opensAgentPlayground',
      { agent: TODO_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for a todo to be deleted by id',
      'sendsAgentMessage',
      { message: 'Delete the todo with id 1' },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the call',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the record, not the id',
      'expectsApprovalReason',
      { containing: 'Buy groceries' },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves it',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the uppercased confirmation',
      'seesInChat',
      { text: 'DELETED', caseSensitive: true },
      { actor: actors.admin }
    )

    return { deleted: true }
  },
})

/**
 * One long conversation rather than six short ones.
 *
 * Each turn depends on the last: the todo deleted at the end is the one added in
 * the middle, and the final listing is only meaningful because of everything
 * before it. Split into separate scenarios this would prove nothing about the
 * composer surviving repeated approval-resume cycles, which is the actual
 * subject.
 */
export const todoAgentFullConversationScenario = pikkuScenario<
  void,
  { turns: number }
>({
  title: 'A full conversation: list, add, deny, batch add, delete, verify',
  description:
    'Six dependent turns in one thread, each surviving the approval-resume cycle before it',
  tags: ['scenario', 'todo-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the todo agent playground',
      'opensAgentPlayground',
      { agent: TODO_AGENT },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks what is on the list',
      'sendsAgentMessage',
      { message: 'How many todos do I have? List them.' },
      { actor: actors.admin }
    )
    await scenario.when(
      'waits for the listing',
      'waitsForAgentResponse',
      undefined,
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a seeded todo, uppercased',
      'seesInChat',
      { text: 'BUY GROCERIES', caseSensitive: true },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks for a todo to be added',
      'sendsAgentMessage',
      { message: "Add a todo called 'Organize sock drawer'" },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the add',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the todo',
      'expectsApprovalReason',
      { containing: 'Organize sock drawer' },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves the add',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the todo confirmed',
      'seesInChat',
      { text: 'Organize sock drawer' },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks for a second todo',
      'sendsAgentMessage',
      { message: "Add a todo called 'Climb Mount Everest barefoot'" },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve it too',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.when(
      'denies it',
      'respondsToApproval',
      { decision: 'deny' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees exactly one request resolved as denied',
      'expectsApprovalOutcomes',
      { denied: 1 },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks for two more at once',
      'sendsAgentMessage',
      {
        message:
          "Add these 2 todos: 'Alphabetize the spice rack' and 'Polish the doorknobs'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve them',
      'seesApprovalRequests',
      undefined,
      { actor: actors.admin }
    )
    await scenario.when(
      'approves everything pending',
      'approvesAllPending',
      undefined,
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the first of the pair',
      'seesInChat',
      { text: 'Alphabetize the spice rack' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the second of the pair',
      'seesInChat',
      { text: 'Polish the doorknobs' },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks for the earlier todo to be deleted by name',
      'sendsAgentMessage',
      { message: "Delete the todo called 'Organize sock drawer'" },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the delete',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves the delete',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )

    await scenario.when(
      'asks for the final listing',
      'sendsAgentMessage',
      { message: 'List all my current todos please' },
      { actor: actors.admin }
    )
    await scenario.when(
      'waits for the listing',
      'waitsForAgentResponse',
      undefined,
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the first todo that survived',
      'seesInChat',
      { text: 'Alphabetize the spice rack' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the second todo that survived',
      'seesInChat',
      { text: 'Polish the doorknobs' },
      { actor: actors.admin }
    )
    // Scoped to the newest reply, not the page: the deleted todo is still on
    // screen further up, in the turn that created it.
    await scenario.then(
      'sees the deleted todo gone from the listing',
      'lastAssistantMessageExcludes',
      { text: 'Organize sock drawer' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees no empty assistant messages',
      'expectsNoEmptyAssistantBlocks',
      undefined,
      { actor: actors.admin }
    )

    return { turns: 6 }
  },
})

export const todoAgentFeature = pikkuFeature({
  name: 'Todo Agent via Console',
  description:
    'Assistant-ui interaction with the todo agent that a protocol test cannot see',
  tags: ['todo-agent', 'console', 'ai-live'],
  scenarios: [
    todoAgentAddApprovedScenario,
    todoAgentMixedApprovalsScenario,
    todoAgentDeleteReasonScenario,
    todoAgentFullConversationScenario,
  ],
})
