import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'
import {
  ControlInput,
  addressesOnScreen,
  currentPath,
  readyToBeUsed,
  selectorFor,
  session,
  underlying,
} from '../lib/browser-vocabulary.js'

export const ClicksInput = z.object(ControlInput)

export const ClicksOutput = z.object({
  testId: z.string(),
  /** Where the click left the browser — a click that navigates says so in the run record. */
  pathname: z.string(),
})

/**
 * Click a control.
 *
 * `locate` filters to what is VISIBLE, which matters more than it sounds: Mantine's
 * responsive props (`hiddenFrom`/`visibleFrom`) are `display: none` rather than conditional
 * rendering, so a control that appears once on screen can match twice in the DOM. An
 * unfiltered match would be a strict-mode violation, and taking the first would wait out a
 * timeout on the copy that is switched off.
 *
 * A remaining ambiguity is reported rather than guessed at — picking one would make the
 * scenario pass while proving something other than what it claims.
 */
export const clicks = pikkuScenarioStep({
  name: 'clicks',
  description: 'clicks a control by its testid',
  template: 'clicks {testId}',
  input: ClicksInput,
  output: ClicksOutput,
  browser: async (_services, input, { browser }) => {
    const actor = session(browser)
    await readyToBeUsed(actor)
    try {
      await actor.locate(selectorFor(input)).click()
    } catch (error) {
      throw new Error(
        `Could not click \`${input.testId}\`${input.within ? ` within \`${input.within}\`` : ''}. ` +
          `${await addressesOnScreen(actor)} ` +
          `If several matched, the key is on more than one control at once — scope it with ` +
          `\`within\` (a component's kebab-cased name) or \`containing\` (text in its row). ` +
          `Underlying: ${underlying(error)}`,
      )
    }
    return { testId: input.testId, pathname: currentPath(actor) }
  },
})
