import { Given, When } from '@cucumber/cucumber'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'
import { ADMIN_USER, GUEST_USER } from '../../src/auth-fixtures.js'

const users = { admin: ADMIN_USER, guest: GUEST_USER }

// Store a credential under the authenticated console user — the identity the
// browser is logged in as and that the agent playground's per-user credential
// check runs under. Use this (not the userId-less "I set credential") whenever
// a browser scenario opens the playground, so the gate actually sees it.
When(
  'I connect credential {string} with value:',
  async function (this: AgentWorld, name: string, docString: string) {
    const userId = await this.currentUserId()
    await fetch(`${config.apiUrl}/rpc/setCredential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { name, valueJson: docString, userId } }),
    })
  }
)

When(
  'I connect the OAuth credential via the popup',
  async function (this: AgentWorld) {
    const popupPromise = this.page.waitForEvent('popup')
    await this.page
      .getByRole('button', { name: /^Connect / })
      .last()
      .click()
    const popup = await popupPromise
    await popup
      .getByText('success', { exact: false })
      .waitFor({ state: 'visible', timeout: 15_000 })
    await popup.close()
  }
)

// Signs the browser in as one of the seeded fixture users. It outlived the
// credentials-console feature it was written for: console-install-addon still
// signs in explicitly, because the package it installs is only reachable to an
// admin.
Given(
  'I sign in to the console as the seeded {string} user',
  async function (this: AgentWorld, which: string) {
    const user = users[which as keyof typeof users]
    if (!user) {
      throw new Error(`unknown seeded user "${which}"`)
    }
    await this.login(user)
  }
)
