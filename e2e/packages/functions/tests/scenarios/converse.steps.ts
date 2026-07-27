/**
 * Conversing with an agent in an actor's persona.
 *
 * `converse` is the actor's own capability: it holds a multi-turn conversation
 * with a Pikku agent over the real transport, in persona, and returns a verdict
 * judging the task against the standard it was given. The steps here are thin
 * because the interesting machinery lives on the actor, not in the test.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { requireActor } from '@pikku/core/workflow'

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
  func: async (_services, { agent, task, evaluate }, { scenarioStep }) => {
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
  func: async (_services, { verdict, passed }) => {
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
  func: async (_services, { title }, { scenarioStep }) => {
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
