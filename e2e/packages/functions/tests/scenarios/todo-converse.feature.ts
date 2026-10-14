/**
 * A virtual user virtual user holding a real conversation with the todo agent.
 *
 * Unlike every other agent scenario this drives no browser and asserts on no
 * transcript text. The virtual user is itself LLM-driven: it is given a task and a
 * standard to judge against, converses over HTTP in virtual user — approving the
 * agent's tool requests as it goes — and returns a verdict.
 *
 * A verdict alone would be a model grading a model, so the store is checked too.
 * That second assertion is the deterministic one, and it is the caller's: it
 * does not care how the conversation went, only that the todo actually landed.
 *
 * Two models are involved and neither is scripted, so this is `ai-live` and runs
 * only where a real key is available.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const TODO_AGENT = 'todoAgent'
const TITLE = 'Book the venue'

export const todoConverseScenario = pikkuScenario<void, { passed: true }>({
  title: 'A shopper gets a todo created, and the store confirms it',
  description:
    'A virtual user virtual user converses with the todo agent and the store is checked independently',
  tags: ['scenario', 'todo-converse', 'ai-live'],
  func: async (_services, _data, { scenario, virtualUsers }) => {
    await scenario.do(
      'the todo list is reset',
      'todos:resetTodos',
      {},
      { virtualUser: virtualUsers.shopper }
    )
    const verdict = await scenario.when(
      'the shopper asks the todo agent to add a todo',
      'conversesWithAgent',
      {
        agent: TODO_AGENT,
        task: `Ask the assistant to add a single todo titled exactly "${TITLE}". When it asks permission to run a tool, allow it.`,
        evaluate: `A todo titled "${TITLE}" was successfully added.`,
      },
      { virtualUser: virtualUsers.shopper }
    )
    await scenario.then(
      'the virtual user concludes the task succeeded',
      'expectsVirtualUserVerdict',
      { verdict, passed: true },
      { virtualUser: virtualUsers.shopper }
    )
    await scenario.then(
      'the store holds the todo',
      'expectsTodoTitled',
      { title: TITLE },
      { virtualUser: virtualUsers.shopper }
    )

    return { passed: true }
  },
})

export const todoConverseFeature = pikkuFeature({
  name: 'A virtual user converses with the todo agent',
  description:
    'A virtual-user-driven conversation, judged by verdict and by store',
  tags: ['todo-converse', 'ai-live'],
  scenarios: [todoConverseScenario],
})
