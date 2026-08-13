/**
 * Conversing with an agent in an actor's persona.
 *
 * `converse` is the actor's own capability: it holds a multi-turn conversation
 * with a Pikku agent over the real transport, in persona, and returns a verdict
 * judging the task against the standard it was given. The steps here are thin
 * because the interesting machinery lives on the actor, not in the test.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { requireActor } from '@pikku/core/scenario'

/**
 * The part of an actor's verdict that survives being a step result.
 *
 * `ActorFlowVerdict` is ordinary JSON already, but pinning the shape here keeps
 * the assertion step honest about what it reads — and keeps the transcript,
 * which is the only thing that makes a failure diagnosable.
 */
export interface ActorVerdict {
  passed: boolean
  reasoning: string
  transcript: string[]
}

export const conversesWithAgent = pikkuScenarioStep<
  { agent: string; task: string; evaluate: string },
  ActorVerdict
>({
  name: 'conversesWithAgent',
  description: 'converses with an agent in persona and returns a verdict',
  template: 'converses with {agent}',
  default: async (_services, { agent, task, evaluate }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    // `always` because the agent's tools are approval-gated and there is nobody
    // at a keyboard: the persona is standing in for the user who would say yes.
    const verdict = await actor.converse({
      agent: agent as never,
      task,
      evaluate,
      approvals: 'always',
    })
    return {
      passed: verdict.passed,
      reasoning: verdict.reasoning,
      transcript: verdict.transcript,
    }
  },
})

/**
 * Checks the actor's own judgement.
 *
 * The transcript travels into the failure message because a verdict on its own
 * says only that a model was unconvinced, which is not something anyone can act
 * on without seeing what was actually said.
 */
export const expectsActorVerdict = pikkuScenarioStep<
  { verdict: ActorVerdict; passed: boolean },
  { passed: boolean }
>({
  name: 'expectsActorVerdict',
  description: 'expects the actor to have judged the task a given way',
  template: 'expects the actor to have judged the task {passed}',
  default: async (_services, { verdict, passed }) => {
    if (verdict.passed !== passed) {
      throw new Error(
        `Expected the actor to judge the task ${passed ? 'succeeded' : 'failed'}: ${verdict.reasoning}\n\nTranscript:\n${verdict.transcript.join('\n')}`
      )
    }
    return { passed: verdict.passed }
  },
})

/**
 * The deterministic half of a live-model scenario.
 *
 * Matched on a normalised substring rather than on equality: the model chooses
 * the exact string it stores, and "Book the venue." is the same todo as
 * "Book the venue" as far as this assertion is concerned.
 */
export const expectsTodoTitled = pikkuScenarioStep<
  { title: string },
  { titles: string[] }
>({
  name: 'expectsTodoTitled',
  description: 'expects the todo store to hold a todo with a given title',
  template: 'expects the store to hold a todo titled {title}',
  default: async (_services, { title }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const { todos } = (await actor.invoke(
      'todos:listTodos' as never,
      {} as never
    )) as { todos: Array<{ title: string }> }
    const titles = todos.map((todo) => todo.title)
    const needle = title.toLowerCase()
    if (!titles.some((stored) => stored.toLowerCase().includes(needle))) {
      throw new Error(
        `No todo titled "${title}" in the store. Got: ${JSON.stringify(titles)}`
      )
    }
    return { titles }
  },
})

/**
 * The same check one state further on: the todo is there *and* it is done.
 *
 * Worth its own step rather than a flag on {@link expectsTodoTitled}, because
 * the two ways it fails are different bugs and reading them apart is the whole
 * value. A todo that is present but not completed is an agent that said "done"
 * without calling anything. A todo that is gone is an agent that had no
 * `completeTodo` and reached for `deleteTodo` instead. Both answer the user
 * with a sentence that sounds identical, and only the store tells them apart —
 * which is why this asserts on the store and not on which tools ran. What
 * matters is that the world changed the way the user was told it did; the call
 * that got it there is an implementation detail.
 */
export const expectsTodoCompleted = pikkuScenarioStep<
  { title: string },
  { completed: boolean }
>({
  name: 'expectsTodoCompleted',
  description: 'expects the todo store to hold a completed todo with a title',
  template: 'expects the store to hold a completed todo titled {title}',
  default: async (_services, { title }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const { todos } = (await actor.invoke(
      'todos:listTodos' as never,
      {} as never
    )) as { todos: Array<{ title: string; completed: boolean }> }
    const needle = title.toLowerCase()
    const matches = todos.filter((todo) =>
      todo.title.toLowerCase().includes(needle)
    )
    if (matches.length === 0) {
      throw new Error(
        `No todo titled "${title}" in the store — it was never added, or it was deleted instead of completed. Got: ${JSON.stringify(
          todos
        )}`
      )
    }
    // Uniqueness is part of the assertion, not pedantry about it. Asked to
    // complete a todo, the agent has been observed adding a second one with the
    // same title and completing *that*, leaving the original open. Every
    // looser reading passes that: "some todo with this title is done" is true,
    // and so is the actor's verdict, because the agent truthfully said it
    // marked one done. Only counting catches it.
    if (matches.length > 1) {
      const open = matches.filter((todo) => !todo.completed).length
      throw new Error(
        `Expected one todo titled "${title}", found ${matches.length} (${open} still open) — the agent added a duplicate instead of completing the one already there. Got: ${JSON.stringify(
          todos
        )}`
      )
    }
    if (!matches[0]!.completed) {
      throw new Error(
        `Todo "${matches[0]!.title}" is still open, so nothing marked it done. Got: ${JSON.stringify(
          todos
        )}`
      )
    }
    return { completed: true }
  },
})
