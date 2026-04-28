import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

const FIXTURES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures'
)

When(
  'I open the changes page comparing {string} against {string}',
  { timeout: 30_000 },
  async function (this: AgentWorld, oursRel: string, baseRel: string) {
    const ours = resolve(FIXTURES_ROOT, oursRel)
    const base = resolve(FIXTURES_ROOT, baseRel)
    const url = `${config.consoleUrl}/changes?base=${encodeURIComponent(
      base
    )}&ours=${encodeURIComponent(ours)}`
    await this.page.goto(url)
    // Wait for at least one tab to appear (diff loaded)
    await this.page
      .locator('[role="tab"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
  }
)

When(
  'I switch to the {word} tab',
  { timeout: 10_000 },
  async function (this: AgentWorld, tabLabel: string) {
    await this.page
      .getByRole('tab', { name: new RegExp(tabLabel, 'i') })
      .click()
  }
)

Then(
  'the {word} tab shows {int} added entry',
  { timeout: 10_000 },
  async function (this: AgentWorld, tabLabel: string, count: number) {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabLabel, 'i') })
    await expect(tab).toBeVisible()
    await expect(tab).toContainText(`+${count}`)
  }
)

Then(
  'the {word} tab shows {int} modified entry',
  { timeout: 10_000 },
  async function (this: AgentWorld, tabLabel: string, count: number) {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabLabel, 'i') })
    await expect(tab).toBeVisible()
    await expect(tab).toContainText(`~${count}`)
  }
)

Then(
  'the changes list contains {string}',
  { timeout: 10_000 },
  async function (this: AgentWorld, entryId: string) {
    const entry = this.page.locator(`text=${entryId}`).first()
    await expect(entry).toBeVisible({ timeout: 5_000 })
  }
)
