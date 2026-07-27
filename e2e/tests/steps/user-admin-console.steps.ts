import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'

const userRow = (world: AgentWorld, email: string) =>
  world.page.locator('tr', { hasText: email })

/**
 * Open the overflow menu for a user and pick one of its items. The menu renders
 * into a portal, so the item is looked up on the page rather than inside the row.
 */
const chooseAction = async (world: AgentWorld, email: string, item: string) => {
  await userRow(world, email)
    .getByRole('button', { name: 'More actions' })
    .click()
  await world.page.getByRole('menuitem', { name: item }).click()
}

When(
  'I add the user {string} with the password {string}',
  async function (this: AgentWorld, email: string, password: string) {
    // ShellHeader renders an off-screen copy of its action node to measure it,
    // so every control in the header resolves to two elements.
    await this.page.getByTestId('create-user').first().click()
    await this.page.getByTestId('create-user-email').fill(email)
    await this.page.getByTestId('create-user-password').fill(password)
    await this.page.getByTestId('create-user-submit').click()
    await expect(this.page.getByTestId('create-user-submit')).toBeHidden()
    this.createdUsers.set(email, password)
  }
)

When(
  'I ban the user {string} from the console',
  async function (this: AgentWorld, email: string) {
    await chooseAction(this, email, 'Ban user')
    await this.page.getByRole('button', { name: 'Ban user' }).click()
    await expect(userRow(this, email).getByText('Banned')).toBeVisible()
  }
)

// Lifting a ban is not destructive, so the menu runs it directly rather than
// asking for a confirmation the operator would only ever accept.
When(
  'I unban the user {string} from the console',
  async function (this: AgentWorld, email: string) {
    await chooseAction(this, email, 'Lift ban')
    await expect(userRow(this, email).getByText('Active')).toBeVisible()
  }
)

When(
  'I sign the user {string} out everywhere from the console',
  async function (this: AgentWorld, email: string) {
    await chooseAction(this, email, 'Sign out everywhere')
    await this.page.getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(
      this.page.getByRole('button', { name: 'Sign out everywhere' })
    ).toBeHidden()
  }
)

When(
  'I set the password of {string} to {string} from the console',
  async function (this: AgentWorld, email: string, password: string) {
    await chooseAction(this, email, 'Set password')
    await this.page
      .getByRole('textbox', { name: 'New password' })
      .fill(password)
    await this.page.getByRole('button', { name: 'Set password' }).click()
    await expect(
      this.page.getByRole('button', { name: 'Set password' })
    ).toBeHidden()
    this.createdUsers.set(email, password)
  }
)

When(
  'I delete the user {string} from the console',
  async function (this: AgentWorld, email: string) {
    await chooseAction(this, email, 'Delete user')
    await this.page.getByRole('button', { name: 'Delete user' }).click()
    await expect(
      this.page.getByRole('button', { name: 'Delete user' })
    ).toBeHidden()
  }
)

Then(
  'I should see the user {string} in the directory',
  async function (this: AgentWorld, email: string) {
    await expect(userRow(this, email)).toBeVisible()
  }
)

Then(
  'I should not see the user {string} in the directory',
  async function (this: AgentWorld, email: string) {
    await expect(userRow(this, email)).toHaveCount(0)
  }
)

Then(
  'the user {string} should be shown as banned',
  async function (this: AgentWorld, email: string) {
    await expect(userRow(this, email).getByText('Banned')).toBeVisible()
  }
)

Then(
  'the user {string} should be shown as active',
  async function (this: AgentWorld, email: string) {
    await expect(userRow(this, email).getByText('Active')).toBeVisible()
  }
)

Then(
  '{string} should be able to sign in with the password {string}',
  async function (this: AgentWorld, email: string, password: string) {
    await this.signInAs({ name: email, email, password })
  }
)

/**
 * Resolve the credentials to sign in with for `email` — a user an earlier step
 * in this scenario created or re-passworded. Moved here from
 * `user-admin.steps.ts`, whose feature is now a pikkuScenario: this console
 * suite is the only remaining caller, and every user it signs in as it created
 * itself, so the seeded-fixture branch went with the move.
 */
const createdCredentials = (world: AgentWorld, email: string) => {
  const password = world.createdUsers.get(email)
  if (!password) {
    throw new Error(`no user created in this scenario for ${email}`)
  }
  return { name: email, email, password }
}

Then(
  '{string} should not be able to sign in',
  async function (this: AgentWorld, email: string) {
    await expect(
      this.signInAs(createdCredentials(this, email))
    ).rejects.toThrow(/sign-in failed/)
  }
)

Then(
  '{string} should be able to sign in',
  async function (this: AgentWorld, email: string) {
    await this.signInAs(createdCredentials(this, email))
  }
)
