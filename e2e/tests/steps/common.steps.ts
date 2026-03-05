import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

Given(
  'I open the {string} playground',
  async function (this: AgentWorld, agentName: string) {
    await this.openAgent(agentName)
  }
)

When('I send {string}', async function (this: AgentWorld, message: string) {
  await this.sendMessage(message)
})

When('I click {string}', async function (this: AgentWorld, buttonText: string) {
  await this.page.getByRole('button', { name: buttonText }).last().click()
})

Then(
  'I should see {string} in the chat',
  async function (this: AgentWorld, expected: string) {
    // Wait for assistant response containing the expected text
    await expect(this.page.locator('body')).toContainText(expected, {
      timeout: config.responseTimeout,
      ignoreCase: true,
    })
  }
)

Then('I should see an approval request', async function (this: AgentWorld) {
  await this.waitForApproval()
})

Then(
  'the approval reason should contain {string}',
  async function (this: AgentWorld, expected: string) {
    // The approval reason is displayed in the yellow approval box
    const approvalBox = this.page
      .getByRole('button', { name: 'Approve' })
      .locator('..')
    await expect(approvalBox.locator('..')).toContainText(expected, {
      timeout: config.responseTimeout,
      ignoreCase: true,
    })
  }
)

Then(
  'I should see {int} approval requests',
  async function (this: AgentWorld, count: number) {
    // Wait for all approval Approve buttons to appear
    const approveButtons = this.page.getByRole('button', { name: 'Approve' })
    await expect(approveButtons).toHaveCount(count, {
      timeout: config.responseTimeout,
    })
  }
)

When(
  'I approve all pending requests',
  { timeout: 5 * 60_000 },
  async function (this: AgentWorld) {
    // Approve all visible buttons, then wait. If more appear (sequential tool calls), repeat.
    let safety = 10
    while (safety-- > 0) {
      const approveButtons = this.page.getByRole('button', { name: 'Approve' })
      const count = await approveButtons.count()
      if (count === 0) break

      for (let i = 0; i < count; i++) {
        await this.page.getByRole('button', { name: 'Approve' }).first().click()
      }

      // Wait for the response to complete (textarea becomes enabled)
      await this.page.waitForFunction(
        () => {
          const ta = document.querySelector('textarea')
          return ta && !ta.disabled
        },
        { timeout: config.responseTimeout }
      )

      // Check if more approval requests appeared (sequential tool calls)
      await this.page.waitForTimeout(2000)
      const moreButtons = await this.page
        .getByRole('button', { name: 'Approve' })
        .count()
      if (moreButtons === 0) break
    }
  }
)

Then(
  'I should see {int} {string} badges in the chat',
  async function (this: AgentWorld, count: number, badgeText: string) {
    const badges = this.page.getByText(badgeText, { exact: true })
    await expect(badges).toHaveCount(count, { timeout: config.responseTimeout })
  }
)

When(
  'I deny the {int}st approval and approve the rest',
  { timeout: 5 * 60_000 },
  denyNthAndApproveRest
)

When(
  'I deny the {int}nd approval and approve the rest',
  { timeout: 5 * 60_000 },
  denyNthAndApproveRest
)

When(
  'I deny the {int}rd approval and approve the rest',
  { timeout: 5 * 60_000 },
  denyNthAndApproveRest
)

async function denyNthAndApproveRest(this: AgentWorld, nth: number) {
  const approveButtons = this.page.getByRole('button', { name: 'Approve' })
  const denyButtons = this.page.getByRole('button', { name: 'Deny' })
  const count = await approveButtons.count()

  // Click buttons from first to last. The nth one (1-indexed) gets denied, rest approved.
  // After each click, the pair disappears, so we always target .first() but track our position.
  for (let i = 0; i < count; i++) {
    if (i === nth - 1) {
      await denyButtons.first().click()
    } else {
      await approveButtons.first().click()
    }
  }

  // Wait for the response to complete
  await this.page.waitForFunction(
    () => {
      const ta = document.querySelector('textarea')
      return ta && !ta.disabled
    },
    { timeout: config.responseTimeout }
  )
}

When('I wait for the response', async function (this: AgentWorld) {
  await this.waitForResponse()
})

Then(
  'I should see exactly {string} in the chat',
  async function (this: AgentWorld, expected: string) {
    await expect(this.page.locator('body')).toContainText(expected, {
      timeout: config.responseTimeout,
    })
  }
)

Then(
  'I should not see {string} in the chat',
  async function (this: AgentWorld, unexpected: string) {
    // Brief wait for content to settle, then assert absence
    await this.page.waitForTimeout(2000)
    const body = await this.page.innerText('body')
    expect(body.toLowerCase()).not.toContain(unexpected.toLowerCase())
  }
)

Then(
  'the last assistant message should not contain {string}',
  async function (this: AgentWorld, unexpected: string) {
    // Get the last assistant message block
    const assistantBlocks = this.page.locator('[data-testid="assistant-block"]')
    const count = await assistantBlocks.count()
    expect(count).toBeGreaterThan(0)
    const lastBlock = assistantBlocks.nth(count - 1)
    const text = await lastBlock.innerText()
    expect(text.toLowerCase()).not.toContain(unexpected.toLowerCase())
  }
)

Then(
  'I should see {string} on the approval badge',
  async function (this: AgentWorld, expected: string) {
    // After denying, a badge shows "Denied"
    await expect(this.page.locator('body')).toContainText(expected, {
      timeout: config.responseTimeout,
      ignoreCase: true,
    })
  }
)
