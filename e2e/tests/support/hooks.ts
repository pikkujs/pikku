import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  setDefaultTimeout,
  type ITestCaseHookParameter,
} from '@cucumber/cucumber'
import type { AgentWorld } from './world.js'
import { STAFF_USER } from '../../src/auth-fixtures.js'
import { randomUUID } from 'crypto'
import { config } from './types.js'
import { startBackend } from '../../bin/backend-harness.js'

// LLM calls can be slow
setDefaultTimeout(config.responseTimeout)

let backend: Awaited<ReturnType<typeof startBackend>> | undefined

BeforeAll(async function () {
  backend = await startBackend({ apiUrl: config.apiUrl })
  await backend.waitUntilReady()
})

AfterAll(async function () {
  backend?.stop()
  backend = undefined
  // Mock OAuth and user seeding teardown is handled by pikkuOnStop in src/lifecycle.ts
})

Before('@console', async function (this: AgentWorld) {
  this.threadId = randomUUID()
  // Reset the in-memory stores to seed data before each scenario
  await Promise.all([
    fetch(`${config.apiUrl}/rpc/todos:resetTodos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    fetch(`${config.apiUrl}/rpc/emails:resetEmails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  ])
  await this.openBrowser()
  await this.login()
  this.recordRequests()
})

After(
  '@console',
  async function (this: AgentWorld, { result }: ITestCaseHookParameter) {
    if (result?.status === 'FAILED') {
      // Take a screenshot on failure for debugging
      try {
        const screenshotPath = `tests/reports/failure-${Date.now()}.png`
        await this.page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`Screenshot saved to ${screenshotPath}`)
      } catch {
        // Ignore screenshot failures
      }
    }
    // A rendered assistant bubble must never be empty. Only assert on
    // scenarios that otherwise passed so this never masks an unrelated
    // failure, and close the browser before throwing so it never leaks.
    let emptyAssistantError: string | undefined
    if (result?.status === 'PASSED') {
      try {
        const blocks = this.page.locator('[data-testid="assistant-block"]')
        const count = await blocks.count()
        for (let i = 0; i < count; i++) {
          const text = (await blocks.nth(i).innerText()).trim()
          if (text === '') {
            emptyAssistantError = `Assistant message #${i + 1} of ${count} rendered empty — assistant replies must never be blank`
            break
          }
        }
      } catch {
        // Page may already be gone; skip the check rather than fail teardown
      }
    }
    const headed = process.env.HEADED === '1' || process.env.HEADED === 'true'
    if (headed) {
      console.log('[headed] Pausing for 10 seconds before closing browser...')
      await new Promise((r) => setTimeout(r, 10_000))
    }
    await this.closeBrowser()
    if (emptyAssistantError) {
      throw new Error(emptyAssistantError)
    }
  }
)

Before('@agent-protocol', async function (this: AgentWorld) {
  this.threadId = randomUUID()
  await fetch(`${config.apiUrl}/rpc/resetLlmLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
})

Before('@console-staff', async function (this: AgentWorld) {
  await this.openBrowser()
  await this.login(STAFF_USER)
})

After('@console-staff', async function (this: AgentWorld) {
  await this.closeBrowser()
})
