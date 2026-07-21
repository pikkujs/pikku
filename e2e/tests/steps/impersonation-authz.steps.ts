import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { IMPERSONATE_HEADER, type AgentWorld } from '../support/world.js'
import {
  ADMIN_USER,
  GUEST_USER,
  type SeedUser,
} from '../../src/auth-fixtures.js'

const usersByEmail: Record<string, SeedUser> = {
  [ADMIN_USER.email]: ADMIN_USER,
  [GUEST_USER.email]: GUEST_USER,
}

When(
  '{string} calls {string} impersonating {string}',
  async function (
    this: AgentWorld,
    email: string,
    rpcName: string,
    targetEmail: string
  ) {
    const user = usersByEmail[email]
    if (!user) {
      throw new Error(`no seeded user for ${email}`)
    }
    const actor = await this.signInAs(user)
    const targetId = await this.userIdByEmail(targetEmail)
    this.lastScopeResponse = await this.rpcResponse(actor, rpcName, null, {
      [IMPERSONATE_HEADER]: targetId,
    })
  }
)

Then(
  'the impersonated response should run as {string}',
  async function (this: AgentWorld, email: string) {
    expect(this.lastScopeResponse?.status).toBe(200)
    expect(this.lastScopeResponse?.body?.userId).toBe(
      await this.userIdByEmail(email)
    )
  }
)
