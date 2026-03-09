import { pikkuAddonServices } from '#pikku'
import { ScreenshotService } from './services/screenshot.service.js'

export const createSingletonServices = pikkuAddonServices(
  async (_config, { variables, content }) => {
    const consoleUrl = await variables.get('PIKKU_CONSOLE_URL')
    if (!consoleUrl) {
      throw new Error(
        'PIKKU_CONSOLE_URL variable is required for the workflow screenshot addon'
      )
    }
    if (!content) {
      throw new Error(
        'ContentService is required for the workflow screenshot addon'
      )
    }

    const screenshotService = new ScreenshotService(consoleUrl)

    return {
      screenshotService,
      content,
    }
  }
)
