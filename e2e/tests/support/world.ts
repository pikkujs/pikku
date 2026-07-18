import { World, setWorldConstructor } from '@cucumber/cucumber'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { randomUUID } from 'crypto'
import { Actor } from '@pikku/cucumber'
import { createAuthClient } from 'better-auth/client'
import { config } from './types.js'
import { ADMIN_USER, type SeedUser } from '../../src/auth-fixtures.js'

const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'

export class AgentWorld extends World {
  browser!: Browser
  context!: BrowserContext
  page!: Page

  /** Unique thread per scenario */
  threadId: string = randomUUID()

  /** Requests seen since recordRequests() was called, with their impersonate header. */
  recorded: { url: string; impersonate: string | null }[] = []

  /** The last raw RPC response captured by the scope-gate suite, per scenario. */
  lastScopeResponse?: { status: number; body: any }

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

  // Console RPCs now require an authenticated session. E2E Standard runs the
  // non-@console suite, where the console UI isn't served — so authenticate at
  // the API level with a Better Auth session cookie (an Actor cookie jar) rather
  // than a browser login. Mirrors tests/steps/auth.steps.ts. Cached per scenario.
  private consoleActor?: Actor

  // Sign in as an arbitrary seeded user and return an Actor owning that user's
  // session cookie jar. Used by the scope-gate suite to exercise the same
  // endpoint as two callers with different scopes.
  async signInAs(user: SeedUser): Promise<Actor> {
    const actor = new Actor('console', {}, config.apiUrl)
    const authClient = createAuthClient({
      baseURL: config.apiUrl,
      fetchOptions: { customFetchImpl: actor.cookieFetch },
    })
    const { error } = await authClient.signIn.email({
      email: user.email,
      password: user.password,
    })
    if (error) {
      throw new Error(
        `sign-in failed for ${user.email}: ${JSON.stringify(error)}`
      )
    }
    return actor
  }

  // POST an RPC carrying an actor's session cookie and return the raw status +
  // parsed body WITHOUT throwing — the scope gate's whole point is the status
  // code, so a 403 is an expected outcome to assert on, not an error.
  async rpcResponse(
    actor: Actor,
    name: string,
    data: unknown = null
  ): Promise<{ status: number; body: any }> {
    const res = await actor.cookieFetch(`${config.apiUrl}/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
    const text = await res.text()
    let body: any = text
    try {
      body = JSON.parse(text)
    } catch {
      // non-JSON body — leave as text
    }
    return { status: res.status, body }
  }

  private async authenticatedActor(): Promise<Actor> {
    if (!this.consoleActor) {
      this.consoleActor = await this.signInAs(ADMIN_USER)
    }
    return this.consoleActor
  }

  // Invoke a console RPC over HTTP carrying the Better Auth session cookie.
  // The raw /rpc response is the function's output.
  async consoleRpc(name: string, data: unknown = {}): Promise<any> {
    const actor = await this.authenticatedActor()
    const res = await actor.cookieFetch(`${config.apiUrl}/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
    if (!res.ok) {
      throw new Error(`RPC ${name} failed (${res.status}): ${await res.text()}`)
    }
    return res.json()
  }

  // Sign in through the LoginScreen UI so the AuthGate lets the console render.
  async login(user: SeedUser = ADMIN_USER) {
    await this.page.goto(config.consoleUrl)
    const instance = this.page.locator('input').first()
    await instance.waitFor({ state: 'visible' })
    await instance.fill(config.apiUrl)
    await this.page.locator('input[type="email"]').fill(user.email)
    await this.page.locator('input[type="password"]').fill(user.password)
    await this.page.locator('button[type="submit"]').click()
    await this.page
      .locator('input[type="password"]')
      .waitFor({ state: 'detached' })
  }

  // Start recording outgoing requests + their impersonation header.
  recordRequests() {
    this.recorded = []
    this.page.on('request', (req) => {
      this.recorded.push({
        url: req.url(),
        impersonate: req.headers()[IMPERSONATE_HEADER] ?? null,
      })
    })
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
    // Wait for either the chat input or a credential prompt to be ready
    await Promise.race([
      this.page.getByPlaceholder('Message...').waitFor({ state: 'visible' }),
      this.page
        .getByText('Connect your accounts')
        .waitFor({ state: 'visible' }),
    ])
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
