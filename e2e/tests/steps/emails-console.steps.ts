import { When } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When('I navigate to the emails page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/emails`)
  await this.page.waitForLoadState('networkidle').catch(() => {})
  await Promise.race([
    this.page
      .getByText('Emails')
      .waitFor({ state: 'visible', timeout: 15_000 }),
    this.page
      .getByText('No email templates found')
      .waitFor({ state: 'visible', timeout: 15_000 }),
  ])
})

When(
  'I click the {string} email template card',
  async function (this: AgentWorld, templateName: string) {
    const card = this.page.locator('button', { hasText: templateName }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()
    await this.page.waitForLoadState('networkidle').catch(() => {})
  }
)
