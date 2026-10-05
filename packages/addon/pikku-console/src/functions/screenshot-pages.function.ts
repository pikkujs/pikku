import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type {
  PageScreenshotInput,
  PageScreenshotOutput,
} from '../services/page-screenshot.service.js'

export const screenshotPages = pikkuFunc<
  PageScreenshotInput,
  PageScreenshotOutput
>({
  title: 'Screenshot Pages',
  description:
    'Opens each page of one frontend on a running server, signed out, and returns a base64 PNG of each. Pass paths to photograph only those; otherwise pages whose params have no value are skipped and listed.',
  expose: true,
  scopes: ['pikku:console:pages:screenshot'],
  func: async ({ pageScreenshotService }, input) => {
    if (!pageScreenshotService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return pageScreenshotService.capture(input)
  },
})
