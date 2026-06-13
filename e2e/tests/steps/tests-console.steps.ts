import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When(
  'I open the tests page',
  { timeout: 45_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/tests`, { timeout: 30_000 })
    await this.page
      .getByRole('button', { name: 'Run tests' })
      .waitFor({ state: 'visible', timeout: 15_000 })
  }
)

Then(
  'the {string} button becomes enabled',
  { timeout: 90_000 },
  async function (this: AgentWorld, buttonName: string) {
    const button = this.page.getByRole('button', { name: buttonName })
    await expect(button).toBeVisible({ timeout: 60_000 })
    await expect(button).toBeEnabled({ timeout: 60_000 })
  }
)
