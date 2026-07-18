import { When, Then } from '@cucumber/cucumber'
import { expect, type Locator } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

// Drives the real console Setup tab for an installed addon (served by `pikku
// dev` at /console) to prove the addon-requirements surface: OAuth integrations
// and secrets the addon needs, their connected/set status, and the inline
// connect / set actions. The "I sign in to the console as the seeded ... user"
// step is shared with credentials-console.steps.ts.

// A Mantine card scoped to its title. `exact` matters: the OAuth card title
// "Fake CRM" is a prefix of the secret card title "Fake CRM API Key".
function requirementCard(world: AgentWorld, title: string): Locator {
  return world.page
    .locator('.mantine-Card-root')
    .filter({ has: world.page.getByText(title, { exact: true }) })
}

When(
  'I open the setup for the {string} addon',
  async function (this: AgentWorld, packageName: string) {
    await this.page.goto(
      `${config.consoleUrl}/addons?id=${encodeURIComponent(packageName)}&source=installed`
    )
    // The Setup tab is the default for an addon with requirements.
    await expect(
      this.page.getByRole('tab', { name: 'Setup' })
    ).toBeVisible({ timeout: 15_000 })
  }
)

Then(
  'the OAuth integration {string} should be {string}',
  async function (this: AgentWorld, name: string, status: string) {
    const card = requirementCard(this, name)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText(status, { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  }
)

Then(
  'the secret {string} should be {string}',
  async function (this: AgentWorld, name: string, status: string) {
    const card = requirementCard(this, name)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText(status, { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  }
)

When(
  'I set the secret {string} to {string}',
  async function (this: AgentWorld, name: string, value: string) {
    const card = requirementCard(this, name)
    // "Set" opens the inline editor; "Update" is the label once a value exists.
    await card.getByRole('button', { name: /^(Set|Update)$/ }).click()
    await card.locator('input').fill(value)
    await card.getByRole('button', { name: 'Save' }).click()
  }
)

Then(
  'I can connect the OAuth integration {string}',
  async function (this: AgentWorld, name: string) {
    const card = requirementCard(this, name)
    await expect(card.getByRole('button', { name: 'Connect' })).toBeEnabled({
      timeout: 15_000,
    })
  }
)

When(
  'I connect the OAuth integration {string}',
  async function (this: AgentWorld, name: string) {
    const card = requirementCard(this, name)
    // Clicking Connect redirects the whole page to the mock OAuth provider,
    // which auto-approves and lands back on this Setup page via the callback.
    // The callback URL is this same page, so a `waitForURL(/\/addons/)` would
    // match immediately without proving anything — instead wait on the end
    // state: the card only reads "Connected" once the callback has stored the
    // platform-owned token and the status query re-runs.
    await card.getByRole('button', { name: 'Connect' }).click()
    await expect(
      requirementCard(this, name).getByText('Connected', { exact: true })
    ).toBeVisible({ timeout: 30_000 })
  }
)
