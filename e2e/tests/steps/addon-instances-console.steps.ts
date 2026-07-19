import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'

// Drives the real console Setup tab for a package that is wired more than once,
// proving the per-instance override resolution: the Setup tab shows an instance
// selector, and picking an instance re-resolves the addon's logical secretId
// against that instance's overrides. Reuses "I open the setup for the {string}
// addon" and the sign-in step from addon-setup-console.steps.ts.

Then(
  'the addon instance selector should be shown',
  async function (this: AgentWorld) {
    // The Mantine <Select label="Instance"> only renders when >1 instance of the
    // package is wired. Target the input by role: the label also labels the
    // dropdown listbox, so getByLabel would match two elements.
    await expect(
      this.page.getByRole('textbox', { name: 'Instance' })
    ).toBeVisible({ timeout: 15_000 })
  }
)

When(
  'I select the addon instance {string}',
  async function (this: AgentWorld, namespace: string) {
    await this.page.getByRole('textbox', { name: 'Instance' }).click()
    // "mailgun" is a prefix of "mailgun-promo" — exact match disambiguates.
    await this.page
      .getByRole('option', { name: namespace, exact: true })
      .click()
  }
)

Then(
  'the secret {string} resolves to {string}',
  async function (
    this: AgentWorld,
    displayName: string,
    resolvedSecretId: string
  ) {
    // The secret card renders its resolved (per-instance) secretId in monospace.
    const card = this.page
      .locator('.mantine-Card-root')
      .filter({ has: this.page.getByText(displayName, { exact: true }) })
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText(resolvedSecretId, { exact: true })).toBeVisible(
      { timeout: 15_000 }
    )
  }
)
