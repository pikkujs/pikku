import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'

/**
 * The sidebar is an accordion: only one titled section is expanded at a time,
 * so a nav link has to be revealed before it can be clicked. Section headers
 * are the only buttons carrying `aria-expanded`, which keeps them apart from
 * same-named page controls (the "Run" section vs a form's Run button).
 */
const revealNavLink = async (
  world: AgentWorld,
  section: string,
  link: string
) => {
  const navLink = world.page.getByRole('link', { name: link, exact: true })
  if (!(await navLink.isVisible().catch(() => false))) {
    await world.page
      .locator('button[aria-expanded]')
      .filter({ hasText: section })
      .click()
  }
  await navLink.click()
}

When('I open the users page in the console', async function (this: AgentWorld) {
  await revealNavLink(this, 'Auth', 'Users')
  await expect(this.page.getByRole('table')).toBeVisible()
})

Then(
  'I should see the user {string} in the users list',
  async function (this: AgentWorld, email: string) {
    await expect(this.page.getByText(email, { exact: true })).toBeVisible()
  }
)

// Impersonation is started from the sidebar's own drawer, not from a per-row
// button on the users page: who you may act as is a global capability, and the
// directory is a read-only listing.
When(
  'I impersonate the user {string}',
  async function (this: AgentWorld, email: string) {
    await this.page.getByText('Impersonate', { exact: true }).click()
    const drawer = this.page.getByRole('dialog')
    await drawer.getByPlaceholder('Search users by email').fill(email)
    await drawer.getByText(email, { exact: true }).click()
  }
)

Then(
  'the impersonation banner should show {string}',
  async function (this: AgentWorld, email: string) {
    await expect(this.page.getByText(`Impersonating ${email}`)).toBeVisible()
  }
)

When(
  'I search the users list for {string}',
  async function (this: AgentWorld, query: string) {
    await this.page
      .getByPlaceholder('Search users by email')
      .first()
      .fill(query)
  }
)

Then(
  'no console chrome request should carry the impersonation header',
  function (this: AgentWorld) {
    const leaked = this.recorded.filter(
      (r) => r.url.includes('/api/auth/') && r.impersonate !== null
    )
    expect(leaked, JSON.stringify(leaked)).toHaveLength(0)
  }
)

When(
  'I start a {string} run from the console',
  async function (this: AgentWorld, workflowName: string) {
    await revealNavLink(this, 'Run', 'Workflows')
    // The workflows index lists every declared workflow as a card carrying its
    // code name; opening one lands on its canvas.
    await this.page.getByText(workflowName, { exact: true }).first().click()
    // Open the new-run form and submit it. Every declared input is required, so
    // fill them all — an incomplete form never sends a request. The outgoing
    // startWorkflow request carries the impersonation header regardless of the
    // server's response.
    await this.page.getByRole('button', { name: 'New workflow run' }).click()
    const inputs = this.page.locator('input:visible')
    await inputs.first().waitFor()
    const inputCount = await inputs.count()
    for (let i = 0; i < inputCount; i++) {
      await inputs.nth(i).fill('5')
    }
    await this.page.locator('button:has(svg.lucide-play)').first().click()
  }
)

Then(
  'the workflow start request should carry the impersonation header',
  async function (this: AgentWorld) {
    await expect
      .poll(() => this.recorded.some((r) => r.impersonate !== null), {
        timeout: 15_000,
      })
      .toBe(true)
  }
)

When('I stop impersonating', async function (this: AgentWorld) {
  await this.page.getByRole('button', { name: 'Stop impersonating' }).click()
})

Then(
  'the impersonation banner should not be shown',
  async function (this: AgentWorld) {
    await expect(this.page.getByText(/^Impersonating /)).toHaveCount(0)
  }
)
