import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { config } from '../support/types.js'

async function rpc(name: string, data: Record<string, unknown> = {}) {
  const res = await fetch(`${config.apiUrl}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json()
}

async function httpPost(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

interface CredentialState {
  lastSignature: string | undefined
  lastVerification: boolean | undefined
  lastError: string | undefined
  savedSignatures: Record<string, string>
  lastOAuthApiStatus: number | undefined
  lastOAuthApiBody: any | undefined
  lastWorkflowResult: any | undefined
}

const state: CredentialState = {
  lastSignature: undefined,
  lastVerification: undefined,
  lastError: undefined,
  savedSignatures: {},
  lastOAuthApiStatus: undefined,
  lastOAuthApiBody: undefined,
  lastWorkflowResult: undefined,
}

// --- Basic CRUD steps ---

Given('credentials are reset', async function () {
  await rpc('resetCredentials', {})
  state.lastSignature = undefined
  state.lastVerification = undefined
  state.lastError = undefined
})

When(
  'I set credential {string} with value:',
  async function (name: string, docString: string) {
    await rpc('setCredential', { name, valueJson: docString })
  }
)

When(
  'I set credential {string} for user {string} with value:',
  async function (name: string, userId: string, docString: string) {
    await rpc('setCredential', { name, valueJson: docString, userId })
  }
)

When('I delete credential {string}', async function (name: string) {
  await rpc('deleteCredential', { name })
})

When(
  'I delete credential {string} for user {string}',
  async function (name: string, userId: string) {
    await rpc('deleteCredential', { name, userId })
  }
)

Then('credential {string} should exist', async function (name: string) {
  const result = await rpc('hasCredential', { name })
  expect(result.exists).toBe(true)
})

Then('credential {string} should not exist', async function (name: string) {
  const result = await rpc('hasCredential', { name })
  expect(result.exists).toBe(false)
})

Then(
  'credential {string} for user {string} should exist',
  async function (name: string, userId: string) {
    const result = await rpc('hasCredential', { name, userId })
    expect(result.exists).toBe(true)
  }
)

Then(
  'credential {string} for user {string} should not exist',
  async function (name: string, userId: string) {
    const result = await rpc('hasCredential', { name, userId })
    expect(result.exists).toBe(false)
  }
)

Then(
  'credential {string} should have value:',
  async function (name: string, docString: string) {
    const expected = JSON.parse(docString)
    const result = await rpc('getCredential', { name })
    expect(JSON.parse(result.valueJson)).toEqual(expected)
  }
)

Then(
  'credential {string} for user {string} should have value:',
  async function (name: string, userId: string, docString: string) {
    const expected = JSON.parse(docString)
    const result = await rpc('getCredential', { name, userId })
    expect(JSON.parse(result.valueJson)).toEqual(expected)
  }
)

Then('credential {string} value should be null', async function (name: string) {
  const result = await rpc('getCredential', { name })
  expect(result.valueJson).toBeNull()
})

Then(
  'user {string} should have {int} credentials',
  async function (userId: string, count: number) {
    const result = await rpc('getAllCredentials', { userId })
    const credentials = JSON.parse(result.credentialsJson)
    expect(Object.keys(credentials).length).toBe(count)
  }
)

Then(
  'user {string} credential {string} should be:',
  async function (userId: string, name: string, docString: string) {
    const expected = JSON.parse(docString)
    const result = await rpc('getAllCredentials', { userId })
    const credentials = JSON.parse(result.credentialsJson)
    expect(credentials[name]).toEqual(expected)
  }
)

// --- HMAC signing addon steps (full wire credential flow) ---

// --- Lazy-loading steps (via session userId, no x-credentials header) ---

When(
  'I sign {string} as user {string}',
  async function (message: string, userId: string) {
    const res = await httpPost(
      '/api/hmac/sign',
      { message },
      { 'x-user-id': userId }
    )
    if (res.status >= 400) {
      state.lastError = res.body.message
      state.lastSignature = undefined
    } else {
      state.lastSignature = res.body.signature
      state.lastError = undefined
    }
  }
)

When(
  'I verify {string} with the signature as user {string}',
  async function (message: string, userId: string) {
    const res = await httpPost(
      '/api/hmac/verify',
      { message, signature: state.lastSignature! },
      { 'x-user-id': userId }
    )
    state.lastVerification = res.body.valid
  }
)

// --- Explicit header loading steps ---

When(
  'I sign {string} with credential {string}',
  async function (message: string, credentialName: string) {
    const res = await httpPost(
      '/api/hmac/sign',
      { message },
      { 'x-credentials': credentialName }
    )
    state.lastSignature = res.body.signature
    state.lastError = undefined
  }
)

When('I sign {string} without credentials', async function (message: string) {
  const res = await httpPost('/api/hmac/sign', { message })
  if (res.status >= 400) {
    state.lastError = res.body.message
    state.lastSignature = undefined
  } else {
    state.lastSignature = res.body.signature
    state.lastError = undefined
  }
})

When(
  'I verify {string} with the signature and credential {string}',
  async function (message: string, credentialName: string) {
    const res = await httpPost(
      '/api/hmac/verify',
      { message, signature: state.lastSignature! },
      { 'x-credentials': credentialName }
    )
    state.lastVerification = res.body.valid
  }
)

When(
  'I verify {string} with signature {string} and credential {string}',
  async function (message: string, signature: string, credentialName: string) {
    const res = await httpPost(
      '/api/hmac/verify',
      { message, signature },
      { 'x-credentials': credentialName }
    )
    state.lastVerification = res.body.valid
  }
)

When('I save the signature as {string}', async function (name: string) {
  state.savedSignatures[name] = state.lastSignature!
})

Then('the signature should not be empty', async function () {
  expect(state.lastSignature).toBeTruthy()
  expect(typeof state.lastSignature).toBe('string')
  expect(state.lastSignature!.length).toBeGreaterThan(0)
})

Then('the verification should be valid', async function () {
  expect(state.lastVerification).toBe(true)
})

Then('the verification should be invalid', async function () {
  expect(state.lastVerification).toBe(false)
})

Then(
  'the sign request should fail with {string}',
  async function (expectedError: string) {
    expect(state.lastError).toContain(expectedError)
  }
)

Then(
  'the signature should differ from {string}',
  async function (savedName: string) {
    const savedSig = state.savedSignatures[savedName]
    expect(savedSig).toBeTruthy()
    expect(state.lastSignature).toBeTruthy()
    expect(state.lastSignature).not.toBe(savedSig)
  }
)

// --- OAuth API addon steps ---

When(
  'I call the OAuth API profile as user {string}',
  async function (userId: string) {
    const res = await fetch(`${config.apiUrl}/api/oauth/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({}),
    })
    state.lastOAuthApiStatus = res.status
    state.lastOAuthApiBody = await res.json()
  }
)

Then(
  'the OAuth API response status should be {int}',
  async function (expectedStatus: number) {
    expect(state.lastOAuthApiStatus).toBe(expectedStatus)
  }
)

Then('the OAuth API profile should be authenticated', async function () {
  expect(state.lastOAuthApiBody.authenticated).toBe(true)
  expect(state.lastOAuthApiBody.token).toBeTruthy()
})

// --- Workflow credential propagation steps ---

When(
  'I run the credential workflow as user {string}',
  async function (userId: string) {
    const res = await fetch(
      `${config.apiUrl}/workflow/credentialWorkflow/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ data: {} }),
      }
    )
    if (res.ok) {
      state.lastWorkflowResult = await res.json()
    } else {
      const text = await res.text()
      try {
        state.lastWorkflowResult = JSON.parse(text)
      } catch {
        state.lastWorkflowResult = { error: text, status: 'failed' }
      }
    }
  }
)

Then(
  'the credential workflow should return an authenticated profile',
  async function () {
    expect(state.lastWorkflowResult).toBeTruthy()
    expect(state.lastWorkflowResult.error).toBeUndefined()
    expect(state.lastWorkflowResult.authenticated).toBe(true)
    expect(state.lastWorkflowResult.token).toBeTruthy()
  }
)

Then(
  'the workflow should fail with {string}',
  async function (expectedError: string) {
    expect(state.lastWorkflowResult).toBeTruthy()
    const hasError =
      state.lastWorkflowResult.status === 'failed' ||
      state.lastWorkflowResult.error ||
      JSON.stringify(state.lastWorkflowResult).includes(expectedError)
    expect(hasError).toBeTruthy()
  }
)
