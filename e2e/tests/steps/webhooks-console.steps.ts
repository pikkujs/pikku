import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

// The URL the trigger points its webhook at — the e2e sink route, delivered
// in-process by the InMemoryQueueService worker. Kept module-scoped so the
// navigate/assert steps can match the exact URL the console renders. Scenarios
// run sequentially, so a single value is safe.
let sinkUrl: string

Given(
  'I trigger a webhook delivery to the local sink',
  { timeout: 30_000 },
  async function (this: AgentWorld) {
    sinkUrl = `${config.apiUrl}/api/webhook/sink`
    await this.consoleRpc('triggerWebhook', { url: sinkUrl })

    // The in-memory queue worker delivers asynchronously (~100-300ms) and then
    // records the attempt — poll the read RPC until the delivery is marked
    // delivered so the UI assertions below aren't racing the worker.
    await expect
      .poll(
        async () => {
          const deliveries = await this.consoleRpc(
            'console:listWebhookDeliveries',
            {}
          )
          return deliveries.find((d: any) => d.url === sinkUrl)?.status
        },
        { timeout: 15_000, intervals: [250, 500, 1_000] }
      )
      .toBe('delivered')
  }
)

When('I navigate to the webhooks page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/webhooks`)
  await this.page.waitForLoadState('networkidle').catch(() => {})
  await this.page
    .getByText('Webhooks')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
})

Then(
  'I should see the delivery URL on the webhooks page',
  { timeout: 15_000 },
  async function (this: AgentWorld) {
    await expect(this.page.getByText(sinkUrl).first()).toBeVisible({
      timeout: 10_000,
    })
  }
)

Then(
  'the delivery status should become {string}',
  { timeout: 15_000 },
  async function (this: AgentWorld, status: string) {
    const row = this.page.locator('table tbody tr', { hasText: sinkUrl })
    await expect(row.first()).toContainText(status, { timeout: 10_000 })
  }
)

Then(
  'I should see attempt {string} with status {int} in the delivery drawer',
  { timeout: 15_000 },
  async function (this: AgentWorld, attemptLabel: string, statusCode: number) {
    const row = this.page.locator('table tbody tr', { hasText: sinkUrl })
    await row.first().click()

    const drawer = this.page.getByRole('dialog')
    await expect(drawer.getByText(attemptLabel).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(drawer.getByText(String(statusCode)).first()).toBeVisible()
  }
)
