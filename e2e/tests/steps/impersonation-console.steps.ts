import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'

When('I open the users page in the console', async function (this: AgentWorld) {
  await this.page.getByRole('link', { name: 'Users', exact: true }).click()
  await expect(this.page.getByRole('table')).toBeVisible()
})

Then(
  'I should see the user {string} in the users list',
  async function (this: AgentWorld, email: string) {
    await expect(this.page.getByText(email, { exact: true })).toBeVisible()
  }
)

When(
  'I impersonate the user {string}',
  async function (this: AgentWorld, email: string) {
    const row = this.page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: 'Impersonate' }).click()
  }
)

Then(
  'the impersonation banner should show {string}',
  async function (this: AgentWorld, email: string) {
    await expect(
      this.page.getByText(`Impersonating ${email}`)
    ).toBeVisible()
  }
)

When(
  'I search the users list for {string}',
  async function (this: AgentWorld, query: string) {
    await this.page
      .getByPlaceholder('Search users by email')
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
    await this.page
      .getByRole('link', { name: 'Workflows', exact: true })
      .click()
    // Pick the workflow from the selector popover.
    const search = this.page.getByPlaceholder('Search workflows...')
    if (!(await search.isVisible().catch(() => false))) {
      await this.page.locator('button:has(svg.lucide-chevron-down)').first().click()
    }
    await search.fill(workflowName)
    await this.page
      .getByText(workflowName, { exact: true })
      .last()
      .click()
    // Open the new-run form and submit it. The outgoing startWorkflow request
    // carries the impersonation header regardless of the server's response.
    await this.page.getByRole('button', { name: 'New workflow run' }).click()
    const value = this.page.locator('input[type="number"]')
    if (await value.count()) {
      await value.first().fill('5')
    }
    await this.page.getByRole('button', { name: 'Run', exact: true }).click()
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
