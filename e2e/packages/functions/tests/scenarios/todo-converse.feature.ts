/**
 * An actor persona holding a real conversation with the todo agent.
 *
 * Unlike every other agent scenario this drives no browser and asserts on no
 * transcript text. The actor is itself LLM-driven: it is given a task and a
 * standard to judge against, converses over HTTP in persona — approving the
 * agent's tool requests as it goes — and returns a verdict.
 *
 * A verdict alone would be a model grading a model, so the store is checked too.
 * That second assertion is the deterministic one, and it is the caller's: it
 * does not care how the conversation went, only that the todo actually landed.
 *
 * Two models are involved and neither is scripted, so this is `ai-live` and runs
 * only where a real key is available.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const TODO_AGENT = 'todoAgent'
const TITLE = 'Book the venue'

export const todoConverseScenario = pikkuScenario<void, { passed: true }>({
  title: 'A shopper gets a todo created, and the store confirms it',
  description:
    'An actor persona converses with the todo agent and the store is checked independently',
  tags: ['scenario', 'todo-converse', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.do(
      'the todo list is reset',
      'todos:resetTodos',
      {},
      { actor: actors.shopper }
    )
    const verdict = await scenario.when(
      'the shopper asks the todo agent to add a todo',
      'conversesWithAgent',
      {
        agent: TODO_AGENT,
        task: `Ask the assistant to add a single todo titled exactly "${TITLE}". When it asks permission to run a tool, allow it.`,
        evaluate: `A todo titled "${TITLE}" was successfully added.`,
      },
      { actor: actors.shopper }
    )
    await scenario.then(
      'the actor concludes the task succeeded',
      'expectsActorVerdict',
      { verdict, passed: true },
      { actor: actors.shopper }
    )
    await scenario.then(
      'the store holds the todo',
      'expectsTodoTitled',
      { title: TITLE },
      { actor: actors.shopper }
    )

    return { passed: true }
  },
})

export const todoConverseFeature = pikkuFeature({
  name: 'An actor converses with the todo agent',
  description: 'A persona-driven conversation, judged by verdict and by store',
  tags: ['todo-converse', 'ai-live'],
  scenarios: [todoConverseScenario],
})
