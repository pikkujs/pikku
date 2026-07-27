import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTestEnvDefaults,
  waitForSeededBackend,
} from './backend-harness.js'

const API_URL = 'http://localhost:4099'

const response = (ok: boolean, cookie?: string) =>
  ({
    ok,
    headers: { get: (name: string) => (name === 'set-cookie' ? cookie : null) },
  }) as unknown as Response

test('the env defaults are applied without spawning anything', () => {
  const { SCENARIO_ACTOR_SECRET, PIKKU_MOCK_LLM } = process.env
  delete process.env.SCENARIO_ACTOR_SECRET
  delete process.env.PIKKU_MOCK_LLM
  try {
    applyTestEnvDefaults()
    // --no-spawn skips startBackend entirely, and the actors still have to sign in
    assert.equal(process.env.SCENARIO_ACTOR_SECRET, 'e2e-actor-secret')
    assert.equal(process.env.PIKKU_MOCK_LLM, '1')
  } finally {
    process.env.SCENARIO_ACTOR_SECRET = SCENARIO_ACTOR_SECRET
    process.env.PIKKU_MOCK_LLM = PIKKU_MOCK_LLM
  }
})

test('an explicit secret and a real-model opt-out both survive the defaults', () => {
  const { SCENARIO_ACTOR_SECRET, PIKKU_MOCK_LLM } = process.env
  process.env.SCENARIO_ACTOR_SECRET = 'deployed-secret'
  process.env.PIKKU_MOCK_LLM = '0'
  try {
    applyTestEnvDefaults()
    assert.equal(process.env.SCENARIO_ACTOR_SECRET, 'deployed-secret')
    assert.equal(process.env.PIKKU_MOCK_LLM, '0')
  } finally {
    process.env.SCENARIO_ACTOR_SECRET = SCENARIO_ACTOR_SECRET
    process.env.PIKKU_MOCK_LLM = PIKKU_MOCK_LLM
  }
})

test('it resolves once the admin sign-in and the console ping both succeed', async () => {
  const seen: string[] = []
  const fetchImpl = (async (url: string) => {
    seen.push(url)
    if (url.endsWith('/api/auth/sign-in/email')) {
      return response(true, 'session=abc')
    }
    return response(true)
  }) as unknown as typeof fetch

  await waitForSeededBackend(API_URL, { fetchImpl, intervalMs: 1 })

  assert.deepEqual(seen, [
    `${API_URL}/api/auth/sign-in/email`,
    `${API_URL}/rpc/console:ping`,
  ])
})

test('it keeps polling while the server refuses connections', async () => {
  let attempts = 0
  const fetchImpl = (async (url: string) => {
    attempts++
    if (attempts < 6) {
      throw new Error('ECONNREFUSED')
    }
    if (url.endsWith('/api/auth/sign-in/email')) {
      return response(true, 'session=abc')
    }
    return response(true)
  }) as unknown as typeof fetch

  await waitForSeededBackend(API_URL, { fetchImpl, intervalMs: 1 })

  assert.equal(attempts, 7, 'five refusals, then sign-in and ping')
})

test('it keeps polling while sign-in succeeds but seeding has not granted scopes', async () => {
  let pings = 0
  const fetchImpl = (async (url: string) => {
    if (url.endsWith('/api/auth/sign-in/email')) {
      return response(true, 'session=abc')
    }
    pings++
    return response(pings >= 3)
  }) as unknown as typeof fetch

  await waitForSeededBackend(API_URL, { fetchImpl, intervalMs: 1 })

  assert.equal(pings, 3, 'a 403 from console:ping is not readiness')
})

test('it rejects as soon as the backend exits, naming the exit code', async () => {
  let exited = false
  const fetchImpl = (async () => {
    exited = true
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch

  await assert.rejects(
    () =>
      waitForSeededBackend(API_URL, {
        fetchImpl,
        intervalMs: 1,
        hasExited: () => (exited ? { code: 1 } : undefined),
      }),
    (error: Error) => error.message.includes('exited with code 1')
  )
})

test('it times out with the apiUrl in the message', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch

  await assert.rejects(
    () =>
      waitForSeededBackend(API_URL, {
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 20,
      }),
    (error: Error) =>
      error.message.includes(API_URL) && error.message.includes('seed')
  )
})
