// @snippet start guideCaptureStep
import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'

export const CapturesScreenInput = z.object({
  path: z.string(),
  name: z.string(),
})

export const CapturesScreenOutput = z.object({ captured: z.boolean() })

export const capturesScreen = pikkuScenarioStep({
  name: 'capturesScreen',
  description: 'captures the named screen',
  template: 'captures {name}',
  input: CapturesScreenInput,
  output: CapturesScreenOutput,
  browser: async (_services, { path, name }, { browser }) => {
    await browser.goto(path)
    await browser.screenshot(name, { showcase: true })
    return { captured: true }
  },
})
// @snippet end guideCaptureStep
