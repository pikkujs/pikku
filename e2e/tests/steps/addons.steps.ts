import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When('I navigate to the addons page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/addons`)
  await this.page.waitForSelector('table', { timeout: 15_000 })
})

Then(
  'I should see the installed addons list',
  async function (this: AgentWorld) {
    const installed = this.page.getByText('Installed')
    await expect(installed.first()).toBeVisible({ timeout: 10_000 })
    const addonHeader = this.page.locator('th', { hasText: 'ADDON' })
    await expect(addonHeader).toBeVisible()
  }
)

Then(
  'I should see addon {string} with package {string}',
  async function (this: AgentWorld, namespace: string, packageName: string) {
    const row = this.page.locator('table tbody tr', { hasText: namespace })
    await expect(row.first()).toBeVisible({ timeout: 10_000 })
    // Package names appear uppercased in badges
    const badge = row.first().getByText(packageName, { exact: false })
    await expect(badge).toBeVisible()
  }
)
