import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import {
  ADMIN_USER,
  GUEST_USER,
  type SeedUser,
} from '../../src/auth-fixtures.js'

const usersByEmail: Record<string, SeedUser> = {
  [ADMIN_USER.email]: ADMIN_USER,
  [GUEST_USER.email]: GUEST_USER,
}

let lastResponse: { status: number; body: any }

When(
  'I call {string} as {string}',
  async function (this: AgentWorld, rpcName: string, email: string) {
    const user = usersByEmail[email]
    if (!user) {
      throw new Error(`no seeded user for ${email}`)
    }
    const actor = await this.signInAs(user)
    lastResponse = await this.rpcResponse(actor, rpcName)
  }
)

Then('the scope response status should be {int}', function (status: number) {
  expect(lastResponse.status).toBe(status)
})

Then('the scope response should contain {string}', function (expected: string) {
  expect(JSON.stringify(lastResponse.body)).toContain(expected)
})
