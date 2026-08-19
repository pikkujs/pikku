/**
 * Working memory arrays, against a real model.
 *
 * The unit tests around `deepMergeWorkingMemory` pin what the merge does with
 * an array — it replaces one wholesale — and one of them pins that the prompt
 * says so. Neither can answer the question issue #1331 was actually about:
 * whether a model, handed that prompt, stops emitting only the item it just
 * learned and wiping the rest of the list.
 *
 * That is a decision only a model makes, so this is `ai-live`. It is also not a
 * browser scenario: the console renders the working memory *schema* and never
 * its value, and the model call log the deterministic agent suite asserts on
 * belongs to the mock provider, which does not exist once the runs are real.
 * The notepad is read back directly instead.
 *
 * A single run of a non-deterministic model is weak evidence on its own — a
 * pass here means the prompt was enough this time, not that it is enough
 * always. It is still the only evidence of the kind that matters.
 *
 * Unverified at the time of writing, for want of a key. What a mocked dry run
 * did show is that declaring `memory.workingMemory` at all makes a run answer
 * 500 with "System messages are not allowed in the prompt or messages fields.
 * Use the instructions option instead" — the notepad reaches the runner as a
 * system-role context message, which the AI SDK in that checkout rejected
 * inside `messages`. Whether that is the repo's bug or that checkout's
 * dependency drift is undetermined: the deterministic agent suite was red
 * beside it, most of it reporting no model calls at all. No agent here declared
 * working memory before this one, so nothing had ever exercised the path.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AGENT = 'shoppingListAgent'
const RESOURCE_ID = 'agent-working-memory-live'
const ALICE = { userId: 'alice' }

export const workingMemoryArrayKeepsEarlierItemsScenario = pikkuScenario<
  void,
  { items: string[] }
>({
  title: 'Adding to a remembered list does not delete what was already on it',
  description:
    'A second turn adds one item, and the two from the first turn are still there',
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
  name: 'Working memory arrays survive a real model’s update',
  description:
    'A model told that arrays are replaced repeats the items it is keeping',
  tags: ['agent-working-memory-live', 'ai-live'],
  scenarios: [workingMemoryArrayKeepsEarlierItemsScenario],
})
