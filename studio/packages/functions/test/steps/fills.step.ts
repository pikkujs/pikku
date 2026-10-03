import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'
import {
  ControlInput,
  addressesOnScreen,
  readyToBeUsed,
  selectorFor,
  session,
  underlying,
} from '../lib/browser-vocabulary.js'

export const FillsInput = z.object({ ...ControlInput, value: z.string() })

export const FillsOutput = z.object({
  testId: z.string(),
  value: z.string(),
})

/**
 * Type a value into a form field.
 *
 * `fill` replaces the field's contents rather than appending, which is what "fills in the
 * form" means and what lets a scenario correct a field it already touched.
 */
export const fills = pikkuScenarioStep({
  name: 'fills',
  description: 'types a value into a form field',
  template: 'fills {testId} with {value}',
  input: FillsInput,
  output: FillsOutput,
  browser: async (_services, input, { browser }) => {
    const actor = session(browser)
    await readyToBeUsed(actor)
    try {
      await actor.locate(selectorFor(input)).fill(input.value)
    } catch (error) {
      throw new Error(
        `Could not fill \`${input.testId}\`${input.within ? ` within \`${input.within}\`` : ''}. ` +
          `${await addressesOnScreen(actor)} ` +
          `A field is addressed by its i18n message key, so this fails when the key differs ` +
          `from the scenario's or the field has no label to derive one from. ` +
          `Underlying: ${underlying(error)}`,
      )
    }
    return { testId: input.testId, value: input.value }
  },
})
