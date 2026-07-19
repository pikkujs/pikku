import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

// The @console Before hook already opened the browser and signed in as the
// admin (admin@e2e.test), who holds pikku:scopes:read/manage via the seeded
// console-admin role — so the scope RPCs behind this UI return 200.

When(
  'I open the scopes page in the console',
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/scopes`)
    await expect(this.page.getByRole('table')).toBeVisible()
  }
)

Then(
  'I should see the role {string}',
  async function (this: AgentWorld, role: string) {
    await expect(
      this.page.getByRole('cell', { name: role, exact: true })
    ).toBeVisible()
  }
)

When('I view the scope vocabulary', async function (this: AgentWorld) {
  await this.page
    .getByRole('radiogroup')
    .locator('label')
    .filter({ hasText: 'Scopes' })
    .click()
})

When('I return to the roles tab', async function (this: AgentWorld) {
  await this.page
    .getByRole('radiogroup')
    .locator('label')
    .filter({ hasText: 'Roles' })
    .click()
})

// The header bar is the Mantine Paper that also holds the Roles/Scopes tab
// switch; scoping to it proves the controls moved out of the table card and up
// into the shared page header, like every other list page.
Then(
  'the create-role action and search live in the page header',
  async function (this: AgentWorld) {
    const header = this.page
      .getByRole('radiogroup')
      .locator('xpath=ancestor::div[contains(@class,"mantine-Paper-root")][1]')
    await expect(
      header.getByRole('button', { name: 'Create role' })
    ).toBeVisible()
    await expect(header.getByPlaceholder(/search roles/i)).toBeVisible()
  }
)

When(
  'I search the roles for {string}',
  async function (this: AgentWorld, query: string) {
    await this.page
      .getByPlaceholder(/search roles/i)
      .first()
      .fill(query)
  }
)

Then(
  'I should not see the role {string}',
  async function (this: AgentWorld, role: string) {
    await expect(
      this.page.getByRole('cell', { name: role, exact: true })
    ).toBeHidden()
  }
)

Then('the roles search box should be empty', async function (this: AgentWorld) {
  await expect(this.page.getByPlaceholder(/search roles/i).first()).toHaveValue(
    ''
  )
})

Then(
  'I should see the declared scope {string}',
  async function (this: AgentWorld, scope: string) {
    await expect(
      this.page.getByRole('cell', { name: scope, exact: true })
    ).toBeVisible()
  }
)

When(
  'I create a role {string} granting the {string} scope',
  async function (this: AgentWorld, role: string, scopeLabel: string) {
    await this.page.getByRole('button', { name: 'Create role' }).click()
    const drawer = this.page.getByRole('dialog')
    await drawer.getByRole('textbox', { name: 'Name' }).fill(role)
    await drawer.getByRole('checkbox', { name: new RegExp(scopeLabel) }).check()
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(drawer).toBeHidden()
  }
)

When('I start creating a role', async function (this: AgentWorld) {
  await this.page.getByRole('button', { name: 'Create role' }).click()
  await expect(this.page.getByRole('dialog')).toBeVisible()
})

When(
  'I grant the {string} scope in the role editor',
  async function (this: AgentWorld, scopeLabel: string) {
    await this.page
      .getByRole('dialog')
      .getByRole('checkbox', { name: new RegExp(scopeLabel) })
      .click()
  }
)

Then(
  'the {string} scope should be selected and locked in the role editor',
  async function (this: AgentWorld, scopeLabel: string) {
    const checkbox = this.page
      .getByRole('dialog')
      .getByRole('checkbox', { name: new RegExp(scopeLabel) })
    await expect(checkbox).toBeChecked()
    await expect(checkbox).toBeDisabled()
  }
)

When(
  'I try to save a new role without a name',
  async function (this: AgentWorld) {
    await this.page.getByRole('button', { name: 'Create role' }).click()
    const drawer = this.page.getByRole('dialog')
    await drawer.getByRole('button', { name: 'Save' }).click()
  }
)

Then(
  'I should see the role name required error',
  async function (this: AgentWorld) {
    await expect(
      this.page.getByRole('dialog').getByText(/enter a name for the role/i)
    ).toBeVisible()
  }
)

When(
  'I open the role {string} with the keyboard',
  async function (this: AgentWorld, role: string) {
    const row = this.page.getByRole('row', { name: new RegExp(role) })
    await row.focus()
    await row.press('Enter')
  }
)

Then(
  'I should see the edit drawer for the role {string}',
  async function (this: AgentWorld, role: string) {
    await expect(
      this.page.getByRole('dialog').getByRole('textbox', { name: 'Name' })
    ).toHaveValue(role)
  }
)

Then(
  'the scope {string} should not be an interactive row',
  async function (this: AgentWorld, scope: string) {
    await expect(
      this.page.getByRole('cell', { name: scope, exact: true })
    ).toBeVisible()
    await expect(
      this.page.getByRole('row', { name: new RegExp(scope) })
    ).not.toHaveAttribute('tabindex', '0')
  }
)

When(
  'I open the roles drawer for {string}',
  async function (this: AgentWorld, email: string) {
    await this.page.goto(`${config.consoleUrl}/users`)
    await expect(this.page.getByRole('table')).toBeVisible()
    await this.page
      .locator('tr', { hasText: email })
      .getByRole('button', { name: 'Roles' })
      .click()
    await expect(
      this.page.getByRole('heading', { name: `Roles — ${email}` })
    ).toBeVisible()
  }
)

Then(
  'the user should hold the role {string}',
  async function (this: AgentWorld, role: string) {
    await expect(
      this.page.getByRole('dialog').getByText(role, { exact: true })
    ).toBeVisible()
  }
)

Then(
  "the user's resolved scopes should include {string}",
  async function (this: AgentWorld, scope: string) {
    await expect(
      this.page.getByRole('dialog').getByText(scope, { exact: true })
    ).toBeVisible()
  }
)

When(
  'I add the role {string} to the user',
  async function (this: AgentWorld, role: string) {
    await this.page.getByRole('button', { name: 'Add role' }).click()
    await this.page.getByRole('menuitem', { name: role }).click()
  }
)

When(
  'I remove the role {string} from the user',
  async function (this: AgentWorld, role: string) {
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: `Remove ${role}` })
      .click()
  }
)

Then(
  'the user should not hold the role {string}',
  async function (this: AgentWorld, role: string) {
    await expect(
      this.page.getByRole('dialog').getByRole('button', {
        name: `Remove ${role}`,
      })
    ).toBeHidden()
  }
)

When(
  'I grant the scope {string} directly to the user',
  async function (this: AgentWorld, scope: string) {
    await this.page
      .getByRole('dialog')
      .getByRole('checkbox', { name: new RegExp(scope) })
      .click()
  }
)

Then(
  'the user should hold the direct scope {string}',
  async function (this: AgentWorld, scope: string) {
    await expect(
      this.page
        .getByRole('dialog')
        .getByRole('checkbox', { name: new RegExp(scope) })
    ).toBeChecked()
  }
)

When(
  'I revoke the direct scope {string} from the user',
  async function (this: AgentWorld, scope: string) {
    await this.page
      .getByRole('dialog')
      .getByRole('checkbox', { name: new RegExp(scope) })
      .click()
  }
)

Then(
  'the user should not hold the direct scope {string}',
  async function (this: AgentWorld, scope: string) {
    await expect(
      this.page
        .getByRole('dialog')
        .getByRole('checkbox', { name: new RegExp(scope) })
    ).not.toBeChecked()
  }
)

When('I navigate to the scopes page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/scopes`)
})

Then(
  'I should see a permission-denied message for roles',
  async function (this: AgentWorld) {
    await expect(this.page.getByText(/permission to view roles/i)).toBeVisible()
  }
)

Then(
  'I should not see a service-unavailable message',
  async function (this: AgentWorld) {
    await expect(
      this.page.getByText(/service may be unavailable/i)
    ).toBeHidden()
  }
)
