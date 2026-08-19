/**
 * Working memory, against a real model.
 *
 * The unit tests around `deepMergeWorkingMemory` pin what the merge does with
 * an array — it replaces one wholesale — and one of them pins that the prompt
 * says so. None of them exercise the path a real run takes: the notepad reaches
 * the runner as a system-role context message, and until that was lifted onto
 * the `system` option every run that declared `memory.workingMemory` answered
 * 500 with "System messages are not allowed in the prompt or messages fields."
 * This scenario is the only thing that catches that, and it is what the title
 * claims — a round trip, not a verdict on the prompt.
 *
 * It is deliberately not the evidence for the prompt's array wording. Measured
 * against `gpt-4.1-mini`, that wording changes nothing: the model keeps the
 * whole list without it, over three items and over seven with an edit-style
 * turn. `gpt-4.1-nano` fails either way, and fails by never writing the notepad
 * at all, which is a different thing entirely. The wording is defensible
 * guidance for weaker models; it is not something this test can show.
 *
 * It is `ai-live` because only a model can make the decision, and not a browser
 * scenario: the console renders the working memory *schema* and never its
 * value, and the model call log the deterministic agent suite asserts on
 * belongs to the mock provider, which does not exist once the runs are real.
 * The notepad is read back directly instead.
 *
 * The runner-side lift lands in the delegate-mode change stacked on top of this
 * branch, so this scenario passes there and not here. `ai-live` runs in no CI
 * suite, so nothing goes red in the meantime.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AGENT = 'shoppingListAgent'
const RESOURCE_ID = 'agent-working-memory-live'
const ALICE = { userId: 'alice' }

export const workingMemoryArrayKeepsEarlierItemsScenario = pikkuScenario<
  void,
  { items: string[] }
>({
  title: 'A thread’s notepad round-trips through a real model',
  description:
    'A second turn adds an item and the notepad comes back holding all of them',
  tags: ['scenario', 'agent-working-memory-live', 'ai-live'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')

    await scenario.given('names two things to buy', 'runsAgent', {
      agent: AGENT,
      message: 'I need to buy milk and eggs.',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })

    await scenario.when('names a third', 'runsAgent', {
      agent: AGENT,
      message: 'Also bread.',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      identity: ALICE,
    })

    const memory = await scenario.when(
      'reads the thread’s working memory',
      'callsRpcAs',
      {
        rpcName: 'agentWorkingMemory',
        data: { threadId: thread.threadId },
        identity: ALICE,
      }
    )

    const list = await scenario.then(
      'sees all three still on the list',
      'expectsWorkingMemoryList',
      {
        call: memory,
        field: 'items',
        holds: ['milk', 'eggs', 'bread'],
      }
    )

    return list
  },
})

export const agentWorkingMemoryLiveFeature = pikkuFeature({
  name: 'Working memory round-trips against a real model',
  description:
    'The notepad survives a real run, which no mocked scenario can show',
  tags: ['agent-working-memory-live', 'ai-live'],
  scenarios: [workingMemoryArrayKeepsEarlierItemsScenario],
})
