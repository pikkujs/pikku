/**
 * The voice assistant, held to what the store says rather than to what it said.
 *
 * This exists because of a failure that reads perfectly in a transcript. Asked
 * to mark a todo done, the agent answered "Okay — marking get lunch done." and
 * called nothing at all; on a later run it reached for `deleteTodo`, the only
 * write it had, and would have destroyed the record had the approval gate not
 * stopped it. Both turns sound like success. Spoken aloud there is no tool-call
 * log beside the sentence, so the reply *is* the whole interface, and the only
 * thing that can contradict it is the store.
 *
 * So the shape here is deliberate: an LLM actor drives a real conversation and
 * returns its own verdict, and then the store is asked separately. The verdict
 * is a model grading a model and catches the conversation going off the rails;
 * the store assertions are deterministic and catch the two failures above,
 * which the verdict alone cannot — a persuaded actor and an unchanged database
 * is exactly the bug.
 *
 * Note what is *not* asserted: which tools ran. That was the first instinct and
 * it is the wrong test. The user asked for a todo to be done, not for
 * `completeTodo` to be invoked, and an assertion on the call name breaks the
 * day the agent finds a better route to the same state. Whether the agent's
 * sentence was *honest* about how it got there is a separate question — a grade
 * on the run, not a check on the world — and belongs to the judge in #719.
 *
 * Two live models and no script, so this is `ai-live`.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AGENT = 'voiceAssistantAgent'
const TITLE = 'get lunch'
/** Seeded, open, and nothing in the task refers to it. */
const BYSTANDER = 'Buy groceries'

export const voiceAssistantCompletesTodoScenario = pikkuScenario<
  void,
  { passed: true }
>({
  title: 'The voice assistant marks a todo done, and the store agrees',
  description:
    'An actor asks for a todo to be added and completed; the store is checked independently',
  tags: ['scenario', 'voice-assistant-converse', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do(
      'the todo list is reset',
      'todos:resetTodos',
      {},
      { actor: actors.shopper }
    )

    const verdict = await scenario.when(
      'the shopper adds a todo and then asks for it to be completed',
      'conversesWithAgent',
      {
        agent: AGENT,
        // Two requests in one task, in this order, because the failure needed
        // both: the completion has to be asked of a todo the agent itself just
        // created, in the same conversation it could answer from memory.
        task: `Ask the assistant to add a todo titled exactly "${TITLE}". Once it confirms, ask it to mark "${TITLE}" as done. When it asks permission to run a tool, allow it.`,
        evaluate: `A todo titled "${TITLE}" was added, and then marked as done.`,
      },
      { actor: actors.shopper }
    )

    await scenario.then(
      'the actor concludes the task succeeded',
      'expectsActorVerdict',
      { verdict, passed: true },
      { actor: actors.shopper }
    )
    // The assertion the transcript cannot make. Absent means it was deleted
    // instead of completed; present-but-open means nothing was called at all.
    await scenario.then(
      'the store holds the todo, completed',
      'expectsTodoCompleted',
      { title: TITLE },
      { actor: actors.shopper }
    )
    // Nothing asked for this one to be touched. A destructive tool reached for
    // by mistake lands somewhere, and it is not always on the todo named.
    await scenario.then(
      'the todo nobody mentioned is still there',
      'expectsTodoTitled',
      { title: BYSTANDER },
      { actor: actors.shopper }
    )

    return { passed: true }
  },
})

export const voiceAssistantConverseFeature = pikkuFeature({
  name: 'The voice assistant is judged by the store, not by its own sentence',
  description:
    'A persona-driven conversation with the voice agent, checked against the records it claims to have changed',
  tags: ['voice-assistant-converse', 'ai-live'],
  scenarios: [voiceAssistantCompletesTodoScenario],
})
