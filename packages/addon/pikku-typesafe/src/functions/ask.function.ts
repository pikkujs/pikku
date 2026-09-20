import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { Answer, Question } from '../lib/schemas.js'

export const AskInput = z.object({
  state: z.unknown().describe('Whatever the questions are being asked about'),
  questions: z
    .record(z.string(), Question)
    .describe('Keyed so the answers come back under the same names'),
})

export const AskOutput = z.object({
  answers: z.record(z.string(), Answer),
})

/**
 * The unopinionated door onto System One, for judgments this addon does not
 * ship a named function for.
 *
 * Every question is evaluated against the same `state` in one request, so
 * asking five related things here is one call, not five — and the answers
 * agree with each other because they were formed together.
 */
export const ask = pikkuSessionlessFunc({
  title: 'Ask System One',
  description:
    'Put one or more typed questions to TypeSafe System One about a piece of state, and get calibrated judgments back rather than generated text.',
  input: AskInput,
  output: AskOutput,
  func: async ({ systemOne }, { state, questions }) => {
    return { answers: await systemOne.ask({ state, questions }) }
  },
})
