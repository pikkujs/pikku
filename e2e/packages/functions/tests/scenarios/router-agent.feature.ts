/**
 * The router agent choosing which domain agent should handle a request.
 *
 * These are the scenarios that most need a REAL model: nothing here is asserted
 * about the protocol, it is asserted about the *decision* — that "list my todos"
 * reaches the todo agent and "send an email to alice@test.com" reaches the email
 * agent, and that a single sentence asking for both reaches both. A scripted
 * mock would be making that choice on the agent's behalf, which is the one thing
 * these cannot outsource. Tagged `ai-live` and held out of the default run.
 *
 * The approval reason is asserted on because a router hides which agent acted:
 * the reason is where the chosen tool explains itself, so it is how routing is
 * observable at all from the console.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const ROUTER_AGENT = 'routerAgent'

export const routerToTodoAgentScenario = pikkuScenario<void, { routed: true }>({
  title: 'A todo request reaches the todo agent',
  description: 'The router hands a listing request to the todo agent',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the todo list',
      'sendsAgentMessage',
      { message: 'List my todos' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a seeded todo come back',
      'seesInChat',
      { text: 'Review pull requests' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees no empty assistant messages',
      'expectsNoEmptyAssistantBlocks',
      undefined,
      { actor: actors.admin }
    )

    return { routed: true }
  },
})

export const routerToTodoAgentWithApprovalScenario = pikkuScenario<
  void,
  { added: true }
>({
  title: 'A routed todo add still asks for approval, and says why',
  description:
    'Routing does not bypass the approval gate, and the reason names the routed action',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for a todo to be added',
      'sendsAgentMessage',
      { message: "Add a todo called 'Routed todo'" },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the routed call',
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
      { containing: 'Routed todo' },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves it',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the todo confirmed',
      'seesInChat',
      { text: 'Routed todo' },
      { actor: actors.admin }
    )

    return { added: true }
  },
})

export const routerToEmailAgentApprovedScenario = pikkuScenario<
  void,
  { sent: true }
>({
  title: 'An email request reaches the email agent and is approved',
  description:
    'The router hands a send request to the email agent, which asks before sending',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for an email to be sent',
      'sendsAgentMessage',
      {
        message:
          "Send an email to alice@test.com with subject 'Hello' and body 'Hi Alice'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the send',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the action',
      'expectsApprovalReason',
      { containing: 'Send an email to' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the recipient',
      'expectsApprovalReason',
      { containing: 'alice@test.com' },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves it',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the send confirmed',
      'seesInChat',
      { text: 'alice@test.com' },
      { actor: actors.admin }
    )

    return { sent: true }
  },
})

export const routerToEmailAgentDeniedScenario = pikkuScenario<
  void,
  { denied: number }
>({
  title: 'A routed email send can be refused',
  description: 'Denying the routed call leaves it resolved as denied',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for an email to be sent',
      'sendsAgentMessage',
      {
        message:
          "Send an email to bob@test.com with subject 'Meeting' and body 'See you at 3pm'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the send',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the action',
      'expectsApprovalReason',
      { containing: 'Send an email to' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reason name the recipient',
      'expectsApprovalReason',
      { containing: 'bob@test.com' },
      { actor: actors.admin }
    )
    await scenario.when(
      'denies it',
      'respondsToApproval',
      { decision: 'deny' },
      { actor: actors.admin }
    )
    const outcomes = await scenario.then(
      'sees the request resolved as denied',
      'expectsApprovalOutcomes',
      { denied: 1 },
      { actor: actors.admin }
    )

    return { denied: outcomes.denied }
  },
})

/**
 * Two different domain agents in one thread.
 *
 * The router has to choose again on the second turn rather than stay with
 * whichever agent handled the first — the failure this guards against is a
 * router that latches onto its first choice for the rest of the conversation.
 */
export const routerAcrossAgentsInOneThreadScenario = pikkuScenario<
  void,
  { agents: number }
>({
  title: 'The router chooses again on the second turn',
  description:
    'A todo turn followed by an email turn in the same thread reaches both agents',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the todo list',
      'sendsAgentMessage',
      { message: 'List my todos' },
      { actor: actors.admin }
    )
    await scenario.when(
      'waits for the listing',
      'waitsForAgentResponse',
      undefined,
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a seeded todo come back',
      'seesInChat',
      { text: 'Buy groceries' },
      { actor: actors.admin }
    )
    await scenario.when(
      'then asks for an email in the same thread',
      'sendsAgentMessage',
      {
        message:
          "Send an email to team@test.com with subject 'Todo update' and body 'Check the todos'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve the send',
      'seesApprovalRequests',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.when(
      'approves it',
      'respondsToApproval',
      { decision: 'approve' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the send confirmed',
      'seesInChat',
      { text: 'team@test.com' },
      { actor: actors.admin }
    )

    return { agents: 2 }
  },
})

export const routerCrossAgentApprovalsScenario = pikkuScenario<
  void,
  { fanned: true }
>({
  title: 'One sentence asking for two domains reaches both',
  description:
    'A single request naming a todo and an email raises approvals from both agents',
  tags: ['scenario', 'router-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for a todo and an email at once',
      'sendsAgentMessage',
      {
        message:
          "Add a todo called 'Email the team' and send an email to team@test.com with subject 'New task' and body 'Added a task'",
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to approve',
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
      'sees the todo confirmed',
      'seesInChat',
      { text: 'Email the team' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the email confirmed',
      'seesInChat',
      { text: 'team@test.com' },
      { actor: actors.admin }
    )

    return { fanned: true }
  },
})

export const routerAgentFeature = pikkuFeature({
  name: 'Router Agent via Console',
  description: 'The router agent delegates requests to domain agents',
  tags: ['router-agent', 'console', 'ai-live'],
  scenarios: [
    routerToTodoAgentScenario,
    routerToTodoAgentWithApprovalScenario,
    routerToEmailAgentApprovedScenario,
    routerToEmailAgentDeniedScenario,
    routerAcrossAgentsInOneThreadScenario,
    routerCrossAgentApprovalsScenario,
  ],
})
