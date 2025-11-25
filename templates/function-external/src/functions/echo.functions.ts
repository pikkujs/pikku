import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { z } from 'zod'

export const echo = pikkuSessionlessFunc<
  { text: string; repeat?: number },
  { echoed: string[]; count: number; noopCalls: number }
>({
  func: async ({ logger, noop }, data) => {
    const repeat = data.repeat || 1
    const echoed = Array.from({ length: repeat }, () => data.text)

    logger.info(`External package: Echoing "${data.text}" ${repeat} times`)

    const noopResult = noop.execute()

    return {
      echoed,
      count: echoed.length,
      noopCalls: noopResult.callCount,
    }
  },
})

// Example using Zod schemas for input/output validation
// Types are automatically inferred from the schemas
export const reverseInputSchema = z.object({
  text: z.string().min(1).describe('The text to reverse'),
  uppercase: z.boolean().optional().describe('Whether to uppercase the result'),
})

export const reverseOutputSchema = z.object({
  original: z.string(),
  reversed: z.string(),
  length: z.number(),
})

export const reverse = pikkuSessionlessFunc({
  input: reverseInputSchema,
  output: reverseOutputSchema,
  func: async ({ logger }, data) => {
    // data is typed as { text: string; uppercase?: boolean }
    const reversed = data.text.split('').reverse().join('')
    const result = data.uppercase ? reversed.toUpperCase() : reversed

    logger.info(`Reversed: "${data.text}" -> "${result}"`)

    return {
      original: data.text,
      reversed: result,
      length: data.text.length,
    }
  },
})
