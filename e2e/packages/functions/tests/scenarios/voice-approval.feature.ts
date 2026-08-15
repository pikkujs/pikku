/**
 * The wording a voice user is asked to consent to.
 *
 * `agent-approval.feature.ts` already proves an approval-gated tool suspends
 * and carries a reason. What matters here is narrower and stricter: the reason
 * reaches the client *exactly* as `approvalDescription` wrote it. A voice
 * client has nothing else to show — it reads this string out and the user
 * answers it — so a reason that has been prefixed, trimmed or summarised is a
 * different question than the one the function sanctioned, and nobody can hear
 * the difference afterwards.
 *
 * Hence `reasonEquals` rather than `reasonContains`. The spoken-side half of
 * this contract (never rewriting the string, refusing to invent one) is
 * covered by `spokenApproval` in `@pikku/voice-agents`.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const AGENT = 'voiceAssistantAgent'
const RESOURCE_ID = 'voice-approval'
const ALICE = { userId: 'alice' }

export const voiceApprovalReasonIsVerbatimScenario = pikkuScenario<
  void,
  { verbatim: true }
>({
  title: 'The spoken approval reason is the function’s wording, untouched',
  description: 'What the voice client reads out is exactly what was sanctioned',
  tags: ['scenario', 'agent-protocol', 'voice-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the voice agent', 'runsAgent', {
      agent: AGENT,
      script: 'add-todo-then-text',
      message: 'add a todo',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })

    await scenario.then(
      'hears exactly what addTodo wrote',
      'expectsApprovalState',
      {
        run,
        suspended: true,
        count: 1,
        // Character for character. `addTodo` writes this and nothing else.
        reasonEquals: 'Add a todo called "Write e2e tests"',
      }
    )
    return { verbatim: true }
  },
})

export const voiceApprovalReasonNamesTheRecordScenario = pikkuScenario<
  void,
  { named: true }
>({
  title: 'A spoken delete names the todo, not the tool',
  description: 'The reason is built from the record the caller would lose',
  tags: ['scenario', 'agent-protocol', 'voice-approval'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    await scenario.given('resets the todo list', 'resetsTodos')

    const run = await scenario.when('runs the voice agent', 'runsAgent', {
      agent: AGENT,
      script: 'delete-todo-then-text',
      message: 'delete that one',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })

    await scenario.then(
      'hears the todo named, not its id',
      'expectsApprovalState',
      {
        run,
        suspended: true,
        count: 1,
        // `resetsTodos` seeds id '1' as "Buy groceries". The point of the
        // assertion is that the reason went to the store for the title rather
        // than reading the id aloud, which no listener could act on.
        reasonEquals: 'Delete the todo called "Buy groceries"',
      }
    )
    return { named: true }
  },
})

export const voiceApprovalFeature = pikkuFeature({
  name: 'A spoken approval asks the function’s own question',
  description:
    'The reason a voice client reads aloud reaches it verbatim, because the sentence is the whole interface',
  tags: ['agent-protocol', 'voice-approval'],
  scenarios: [
    voiceApprovalReasonIsVerbatimScenario,
    voiceApprovalReasonNamesTheRecordScenario,
  ],
})
