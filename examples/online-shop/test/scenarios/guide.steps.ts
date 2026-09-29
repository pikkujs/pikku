// @snippet start guideCaptureStep
import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'

export const CapturesScreenInput = z.object({
  name: z.string(),
  path: z.string().optional(),
})

export const CapturesScreenOutput = z.object({ captured: z.boolean() })

export const capturesScreen = pikkuScenarioStep({
  name: 'capturesScreen',
  description: 'captures the current screen, or the one at path, under a caption',
  template: 'captures {name}',
  input: CapturesScreenInput,
  output: CapturesScreenOutput,
  browser: async (_services, { path, name }, { browser }) => {
    if (path) await browser.goto(path)
    await browser.screenshot(name, { showcase: true })
    return { captured: true }
  },
})
// @snippet end guideCaptureStep
