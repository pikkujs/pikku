import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { SHAPES, taskQuestions } from '../lib/task-questions.js'

export const ClassifyTaskInput = z.object({
  task: z.string().describe("What needs doing, in the requester's own words"),
  context: z
    .string()
    .optional()
    .describe(
      'Anything about the codebase or constraints that bears on the answer'
    ),
})

export const ClassifyTaskOutput = z.object({
  plan: z.object({
    needed: z.boolean(),
    noul: z.number(),
  }),
  shape: z.object({
    choice: z.enum(Object.keys(SHAPES) as [string, ...string[]]),
    confidence: z.number(),
    probabilities: z.record(z.string(), z.number()),
  }),
})

/**
 * Answers the two questions asked at the top of every piece of work: is this
 * worth planning, and what should it be built as.
 *
 * Both are asked in one request against the same state, so the shape is
 * judged by an evaluator that has already weighed how well specified the task
 * is. `plan.needed` is the 0.5 cut on `plan.noul`; callers wanting a
 * different threshold should read the number.
 *
 * A low `shape.confidence` is the useful signal, not a failure: it means the
 * description does not yet say enough to choose, which is itself a reason to
 * plan.
 */
export const classifyTask = pikkuSessionlessFunc({
  title: 'Classify a task',
  description:
    'Given a task description, judge whether it should be planned out first and whether to build it as a function, a workflow or an agent.',
  input: ClassifyTaskInput,
  output: ClassifyTaskOutput,
  func: async ({ systemOne }, { task, context }) => {
    const answers = await systemOne.ask({
      state: { task, context },
      questions: taskQuestions,
    })

    const plan = answers.plan
    const shape = answers.shape
    if (plan?.type !== 'noul' || shape?.type !== 'choice') {
      throw new Error('typesafe answered with the wrong question types')
    }

    return {
      plan: { needed: plan.noul >= 0.5, noul: plan.noul },
      shape: {
        choice: shape.choice,
        confidence: shape.confidence,
        probabilities: shape.probabilities,
      },
    }
  },
})
