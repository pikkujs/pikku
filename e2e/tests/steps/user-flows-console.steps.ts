import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When('I navigate to the workflows page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/workflow`)
  await this.page.waitForLoadState('networkidle').catch(() => {})
  await this.page
    .getByText('Workflows', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
})

When(
  'I switch the workflows view to {string}',
  async function (this: AgentWorld, viewName: string) {
    // Mantine SegmentedControl hides its radio inputs — click the label text,
    // scoped to the control so the "Workflows" page title doesn't match.
    // Mantine renders each segment label twice (one copy for sizing) — .first()
    await this.page
      .locator('.mantine-SegmentedControl-root')
      .getByText(viewName, { exact: true })
      .first()
      .click()
  }
)

Then(
  'the entity card {string} should be visible',
  async function (this: AgentWorld, name: string) {
    await expect(this.page.getByTestId(`entity-card-${name}`)).toBeVisible({
      timeout: 10_000,
    })
  }
)

Then(
  'the entity card {string} should not be visible',
  async function (this: AgentWorld, name: string) {
    await expect(this.page.getByTestId(`entity-card-${name}`)).toHaveCount(0)
  }
)

Then(
  'the entity card {string} should contain {string}',
  async function (this: AgentWorld, name: string, text: string) {
    const card = this.page.getByTestId(`entity-card-${name}`)
    await expect(card.getByText(text, { exact: true })).toBeVisible({
      timeout: 5_000,
    })
  }
)
