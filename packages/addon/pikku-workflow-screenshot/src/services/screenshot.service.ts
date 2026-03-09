import { chromium } from 'playwright'

export class ScreenshotService {
  private consoleUrl: string

  constructor(consoleUrl: string) {
    this.consoleUrl = consoleUrl
  }

  async renderWorkflowImage(
    workflowData: any,
    options: {
      width?: number
      height?: number
      format?: 'png' | 'jpeg'
    } = {}
  ): Promise<Buffer> {
    const { width = 1280, height = 720, format = 'png' } = options

    let browser
    try {
      browser = await chromium.launch({ headless: true })
    } catch (e: any) {
      if (
        e.message?.includes('Executable doesn') ||
        e.message?.includes('browserType.launch')
      ) {
        throw new Error(
          'Chromium browser is not installed. Install it with: npx playwright install chromium'
        )
      }
      throw e
    }

    try {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 2,
      })

      await page.goto(`${this.consoleUrl}/render/workflow`, {
        waitUntil: 'networkidle',
      })

      await page.evaluate((data) => {
        ;(window as any).__PIKKU_RENDER_DATA__ = data
        window.dispatchEvent(new Event('pikku-render-data'))
      }, workflowData)

      await page.waitForFunction(() => (window as any).__PIKKU_RENDER_READY__, {
        timeout: 10000,
      })

      await page.waitForTimeout(200)

      const screenshot = await page.screenshot({
        type: format,
        fullPage: false,
      })

      return Buffer.from(screenshot)
    } finally {
      await browser.close()
    }
  }
}
