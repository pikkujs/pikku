import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When(
  'I open the auth providers page in the console',
  { timeout: 30_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/auth-providers`)
    await this.page.waitForTimeout(2000)
  }
)

Then(
  'I should see provider {string} in the list',
  { timeout: 10_000 },
  async function (this: AgentWorld, providerName: string) {
    const item = this.page.locator('text=' + providerName).first()
    await expect(item).toBeVisible({ timeout: 5_000 })
  }
)

Then(
  'provider {string} should be marked as configured',
  { timeout: 10_000 },
  async function (this: AgentWorld, providerName: string) {
    const id = providerName.toLowerCase()
    const badge = this.page
      .locator(`[data-testid="auth-provider-configured-${id}"]`)
      .first()
    await expect(badge).toBeVisible({ timeout: 5_000 })
  }
)

Then(
  'provider {string} should not be marked as configured',
  { timeout: 10_000 },
  async function (this: AgentWorld, providerName: string) {
    const id = providerName.toLowerCase()
    const badge = this.page
      .locator(`[data-testid="auth-provider-configured-${id}"]`)
      .first()
    await expect(badge).not.toBeVisible({ timeout: 5_000 })
  }
)
