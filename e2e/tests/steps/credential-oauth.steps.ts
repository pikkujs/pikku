import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { config } from '../support/types.js'
import {
  startMockOAuthServer,
  stopMockOAuthServer,
} from '../support/mock-oauth-server.js'

let mockServerStarted = false

interface OAuthState {
  currentUserId: string
  lastRedirectUrl: string | undefined
  lastCallbackState: string | undefined
}

const state: OAuthState = {
  currentUserId: '',
  lastRedirectUrl: undefined,
  lastCallbackState: undefined,
}

Given('the mock OAuth server is running', async function () {
  if (!mockServerStarted) {
    await startMockOAuthServer()
    mockServerStarted = true
  }
})

When(
  'user {string} initiates OAuth connect for {string}',
  async function (userId: string, credentialName: string) {
    state.currentUserId = userId
    const res = await fetch(
      `${config.apiUrl}/credentials/${credentialName}/connect`,
      {
        method: 'GET',
        headers: { 'x-user-id': userId },
        redirect: 'manual',
      }
    )
    state.lastRedirectUrl = res.headers.get('location') ?? undefined
  }
)

Then(
  'the connect response should redirect to the mock provider',
  async function () {
    expect(state.lastRedirectUrl).toBeTruthy()
    expect(state.lastRedirectUrl).toContain('/authorize')
  }
)

When(
  'the OAuth callback is completed for {string}',
  async function (credentialName: string) {
    const redirectUrl = state.lastRedirectUrl!
    const url = new URL(redirectUrl)
    const stateParam = url.searchParams.get('state')!
    const redirectUri = url.searchParams.get('redirect_uri')!

    const callbackUrl = `${redirectUri}?code=mock-auth-code&state=${encodeURIComponent(stateParam)}`
    const res = await fetch(callbackUrl, {
      method: 'GET',
      redirect: 'manual',
    })
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.credentialName).toBe(credentialName)
  }
)

Then(
  'the OAuth status for {string} as user {string} should be connected',
  async function (credentialName: string, userId: string) {
    const res = await fetch(
      `${config.apiUrl}/credentials/${credentialName}/status`,
      {
        headers: { 'x-user-id': userId },
      }
    )
    const body = await res.json()
    expect(body.connected).toBe(true)
    expect(body.hasRefreshToken).toBe(true)
  }
)

Then(
  'the OAuth status for {string} as user {string} should be disconnected',
  async function (credentialName: string, userId: string) {
    const res = await fetch(
      `${config.apiUrl}/credentials/${credentialName}/status`,
      {
        headers: { 'x-user-id': userId },
      }
    )
    const body = await res.json()
    expect(body.connected).toBe(false)
  }
)

When(
  'user {string} disconnects OAuth for {string}',
  async function (userId: string, credentialName: string) {
    const res = await fetch(`${config.apiUrl}/credentials/${credentialName}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    })
    const body = await res.json()
    expect(body.success).toBe(true)
  }
)
