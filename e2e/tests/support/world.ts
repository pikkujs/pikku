import { World, setWorldConstructor } from '@cucumber/cucumber'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { randomUUID } from 'crypto'
import { config } from './types.js'

export class AgentWorld extends World {
  browser!: Browser
  context!: BrowserContext
  page!: Page

  /** Unique thread per scenario */
  threadId: string = randomUUID()

  async openBrowser() {
    const headed = process.env.HEADED === '1' || process.env.HEADED === 'true'
    this.browser = await chromium.launch({
      headless: !headed,
      slowMo: headed ? 200 : 0,
    })
    this.context = await this.browser.newContext()
    this.page = await this.context.newPage()
    this.page.setDefaultTimeout(config.responseTimeout)
    // Point the Pikku Console at the e2e backend
    await this.page.addInitScript((apiUrl: string) => {
      localStorage.setItem('pikku-server-url', apiUrl)
    }, config.apiUrl)
  }

  async closeBrowser() {
    await this.context?.close()
    await this.browser?.close()
  }

  /**
   * Navigate to the agent playground for a given agent.
   * Creates a fresh threadId to isolate scenarios.
   */
  async openAgent(agentName: string) {
    this.threadId = randomUUID()
    await this.page.goto(
      `${config.consoleUrl}/agents/playground?id=${agentName}&threadId=${this.threadId}`
    )
    // Wait for the chat input to be ready
    await this.page.getByPlaceholder('Message...').waitFor({ state: 'visible' })
  }

  /**
   * Type a message and send it.
   * Waits for the textarea to be enabled first (in case a previous response is completing).
   * After submitting, verifies the runtime accepted the message by checking the textarea was cleared.
   * Retries submission if the runtime didn't pick it up (happens after approval-resume cycles).
   */
  async sendMessage(message: string) {
    const input = this.page.getByPlaceholder('Message...')
    // Wait for textarea to be enabled (runtime back to idle)
    await this.waitForTextareaEnabled()

    // Try submitting, with retries if the runtime doesn't process the message
    for (let attempt = 0; attempt < 5; attempt++) {
      // Brief settle for assistant-ui runtime after approval-resume cycles
      await this.page.waitForTimeout(1_000)

      await input.click()
      await input.fill(message)
      await this.page.evaluate(() => {
        const form = document.querySelector('form')
        if (form) form.requestSubmit()
      })

      // Wait for textarea to be cleared (runtime consumed the message)
      try {
        await this.page.waitForFunction(
          () => {
            const ta = document.querySelector('textarea')
            return ta && ta.value === ''
          },
          { timeout: 5_000 }
        )
        return // Message accepted
      } catch {
        // Textarea still has text — runtime didn't consume it. Retry.
        await this.waitForTextareaEnabled()
      }
    }
    throw new Error(`Message was not consumed after 5 attempts: "${message}"`)
  }

  /**
   * Wait for the textarea to become enabled (runtime idle).
   */
  async waitForTextareaEnabled() {
    await this.page.waitForFunction(
      () => {
        const ta = document.querySelector('textarea')
        return ta && !ta.disabled
      },
      { timeout: config.responseTimeout }
    )
  }

  /**
   * Wait for the assistant to finish responding.
   */
  async waitForResponse() {
    // Wait for at least one assistant message to appear
    await this.page.locator('text=Assistant').first().waitFor({
      state: 'visible',
      timeout: config.responseTimeout,
    })

    // Wait for textarea to be enabled (response complete)
    await this.waitForTextareaEnabled()
  }

  /**
   * Wait for an approval request to appear (yellow box with Approve/Deny buttons).
   */
  async waitForApproval(timeout = config.responseTimeout) {
    await this.page.getByRole('button', { name: 'Approve' }).first().waitFor({
      state: 'visible',
      timeout,
    })
  }

  async clickApprove() {
    await this.page.getByRole('button', { name: 'Approve' }).click()
  }

  async clickDeny() {
    await this.page.getByRole('button', { name: 'Deny' }).click()
  }

  async getAssistantText(): Promise<string> {
    const messages = this.page.locator('[style*="flex-start"] [data-status]')
    const count = await messages.count()
    if (count > 0) {
      const texts: string[] = []
      for (let i = 0; i < count; i++) {
        texts.push(await messages.nth(i).innerText())
      }
      return texts.join('\n')
    }
    const chatArea = this.page.locator('[class*="thread"]')
    return chatArea.innerText().catch(() => '')
  }

  async getPageText(): Promise<string> {
    return this.page.innerText('body')
  }
}

setWorldConstructor(AgentWorld)
