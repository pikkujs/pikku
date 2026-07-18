import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { ADMIN_USER, GUEST_USER } from '../../src/auth-fixtures.js'

// Drives the real console UI (served by `pikku dev` at /console) to prove the
// console:admin gate the way a user experiences it: an admin reaches the
// credential surface; a non-admin is stopped at the console's AuthGate. This is
// the UI-level counterpart to the API-level console-authz.feature.

const users = { admin: ADMIN_USER, guest: GUEST_USER }

Given(
  'I sign in to the console as the seeded {string} user',
  async function (this: AgentWorld, which: string) {
    const user = users[which as keyof typeof users]
    expect(user, `unknown seeded user "${which}"`).toBeTruthy()
    await this.login(user)
  }
)

When('I open the Credentials page', async function (this: AgentWorld) {
  await this.page
    .getByRole('link', { name: 'Credentials', exact: true })
    .click()
})

Then(
  'I should see the credential connections UI',
  async function (this: AgentWorld) {
    // The ShellHeader subtitle text is rendered twice: once visibly and once in
    // the offscreen (visibility:hidden) width-measurement layer. The visible
    // header renders first in DOM order, so .first() selects it.
    await expect(
      this.page.getByText('OAuth2 and API key credentials').first()
    ).toBeVisible()
  }
)

Then(
  'I should see the console not-authorized screen',
  async function (this: AgentWorld) {
    await expect(
      this.page.getByText(/does not have admin access/i)
    ).toBeVisible()
  }
)
