import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import {
  ADMIN_USER,
  GUEST_USER,
  STAFF_USER,
  TARGET_USER,
  type SeedUser,
} from '../../src/auth-fixtures.js'

const usersByEmail: Record<string, SeedUser> = {
  [ADMIN_USER.email]: ADMIN_USER,
  [GUEST_USER.email]: GUEST_USER,
  [STAFF_USER.email]: STAFF_USER,
  [TARGET_USER.email]: TARGET_USER,
}

const seedUser = (email: string): SeedUser => {
  const user = usersByEmail[email]
  if (!user) {
    throw new Error(`no seeded user for ${email}`)
  }
  return user
}

/**
 * Call one of the scaffolded user-management RPCs as `callerEmail`, targeting
 * `targetEmail`. Signs the caller in fresh every time: the role better-auth
 * gates on is projected while the session is built, so a session minted before
 * a scope changed would prove nothing about the scope.
 */
const callAs = async (
  world: AgentWorld,
  callerEmail: string,
  rpcName: string,
  targetEmail: string,
  extra: Record<string, unknown> = {}
) => {
  const actor = await world.signInAs(seedUser(callerEmail))
  const userId = await world.userIdByEmail(targetEmail)
  world.lastScopeResponse = await world.rpcResponse(actor, rpcName, {
    userId,
    ...extra,
  })
}

When(
  '{string} bans {string}',
  async function (this: AgentWorld, caller: string, target: string) {
    await callAs(this, caller, 'pikkuAdminSetUserBanned', target, {
      banned: true,
      reason: 'e2e',
    })
  }
)

When(
  '{string} unbans {string}',
  async function (this: AgentWorld, caller: string, target: string) {
    await callAs(this, caller, 'pikkuAdminSetUserBanned', target, {
      banned: false,
    })
  }
)

When(
  '{string} deletes {string}',
  async function (this: AgentWorld, caller: string, target: string) {
    await callAs(this, caller, 'pikkuAdminRemoveUser', target)
  }
)

When(
  '{string} signs {string} out everywhere',
  async function (this: AgentWorld, caller: string, target: string) {
    await callAs(this, caller, 'pikkuAdminRevokeUserSessions', target)
  }
)

When(
  '{string} sets the password of {string} to {string}',
  async function (
    this: AgentWorld,
    caller: string,
    target: string,
    newPassword: string
  ) {
    await callAs(this, caller, 'pikkuAdminSetUserPassword', target, {
      newPassword,
    })
  }
)

Then(
  '{string} should not be able to sign in',
  async function (this: AgentWorld, email: string) {
    await expect(this.signInAs(seedUser(email))).rejects.toThrow(
      /sign-in failed/
    )
  }
)

Then(
  '{string} should be able to sign in',
  async function (this: AgentWorld, email: string) {
    await this.signInAs(seedUser(email))
  }
)
