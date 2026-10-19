import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'
import { session } from '../lib/browser-vocabulary.js'

export const SeesTextInput = z.object({
  text: z.string(),
})

export const SeesTextOutput = z.object({
  text: z.string(),
})

/** Wait for a string to appear on the page, failing with the driver's own timeout. */
export const seesText = pikkuScenarioStep({
  name: 'seesText',
  description: 'waits for text to appear on the current page',
  template: 'sees {text}',
  input: SeesTextInput,
  output: SeesTextOutput,
  browser: async (_services, { text }, { browser }) => {
    await session(browser).expectText(text)
    return { text }
  },
})
