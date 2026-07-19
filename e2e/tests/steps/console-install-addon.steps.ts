import { When, Then, After } from '@cucumber/cucumber'
import { expect, type Locator } from '@playwright/test'
import { rm } from 'node:fs/promises'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

// Drives the real console addons gallery (served by `pikku dev` at /console) to
// prove the install flow: naming an instance, the clean inline conflict when a
// name is already wired (the fix for a raw 500), and landing on setup after a
// fresh install. The "I sign in to the console as the seeded ... user" step is
// shared with credentials-console.steps.ts.

// A gallery card scoped to the package name it renders (monospace `addon.name`).
function addonCard(world: AgentWorld, packageName: string): Locator {
  return world.page
    .locator('.mantine-Card-root')
    .filter({ hasText: packageName })
}

When(
  'I open the browse drawer for the {string} addon',
  async function (this: AgentWorld, packageName: string) {
    // The gallery only shows the catalogue under the All filter, which is the
    // default for an editable (local dev) console.
    await this.page.goto(`${config.consoleUrl}/addons`)
    const card = addonCard(this, packageName).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.click()
    // The drawer for a not-yet-installed addon carries the instance-name field.
    await expect(
      this.page.getByLabel('Instance name')
    ).toBeVisible({ timeout: 15_000 })
  }
)

When(
  'I set the install instance name to {string}',
  async function (this: AgentWorld, name: string) {
    const input = this.page.getByLabel('Instance name')
    await input.fill(name)
  }
)

When('I click add to project', async function (this: AgentWorld) {
  await this.page.getByRole('button', { name: 'Add to project' }).click()
})

Then(
  'the add to project button should be disabled',
  async function (this: AgentWorld) {
    // An invalid instance name (isValidNamespace fails) disables the CTA, so a
    // bad name can never even reach the server.
    await expect(
      this.page.getByRole('button', { name: 'Add to project' })
    ).toBeDisabled()
  }
)

Then(
  'the install error should contain {string}',
  async function (this: AgentWorld, fragment: string) {
    // The drawer renders the server's typed-error message inline in an Alert
    // (never a 500 stack). A raw 500 would surface a different, generic message.
    await expect(
      this.page.getByText(new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    ).toBeVisible({ timeout: 15_000 })
  }
)

Then(
  'I should land on the setup for {string}',
  async function (this: AgentWorld, packageName: string) {
    // On success the console routes to the installed addon's detail page
    // (?id=<pkg>&source=installed) whose Setup tab is the default.
    await expect(this.page).toHaveURL(
      new RegExp(`id=${encodeURIComponent(packageName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      { timeout: 30_000 }
    )
    await expect(
      this.page.getByRole('tab', { name: 'Setup' })
    ).toBeVisible({ timeout: 30_000 })
  }
)

// Installing writes `packages/functions/src/addons/<name>.addon.ts` into the
// fixture project. Remove it so the run stays hermetic — otherwise the wiring
// lingers and the next `pikku dev` boot loads a stray addon.
After({ tags: '@mutates-project' }, async function () {
  const wiring = new URL(
    '../../packages/functions/src/addons/mandrill-e2e.addon.ts',
    import.meta.url
  )
  await rm(wiring, { force: true })
})
