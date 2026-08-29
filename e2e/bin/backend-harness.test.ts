import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTestEnvDefaults } from './backend-harness.js'

const withCleanEnv = (fn: () => void) => {
  const { SCENARIO_ACTOR_SECRET, PIKKU_MOCK_LLM } = process.env
  try {
    fn()
  } finally {
    process.env.SCENARIO_ACTOR_SECRET = SCENARIO_ACTOR_SECRET
    process.env.PIKKU_MOCK_LLM = PIKKU_MOCK_LLM
  }
}

test('the app defaults are applied without spawning anything', () => {
  withCleanEnv(() => {
    delete process.env.SCENARIO_ACTOR_SECRET
    delete process.env.PIKKU_MOCK_LLM
    applyTestEnvDefaults()
    const secret = process.env.SCENARIO_ACTOR_SECRET ?? ''
    assert.ok(
      secret.length >= 32,
      'a root shorter than key material refuses every actor sign-in'
    )
    assert.equal(secret, 'e2e-actor-secret-long-enough-to-derive-from')
    assert.equal(process.env.PIKKU_MOCK_LLM, '1')
  })
})

test('an explicit secret and a real-model opt-out both survive the defaults', () => {
  withCleanEnv(() => {
    process.env.SCENARIO_ACTOR_SECRET = 'deployed-secret-long-enough-to-derive'
    process.env.PIKKU_MOCK_LLM = '0'
    applyTestEnvDefaults()
    assert.equal(
      process.env.SCENARIO_ACTOR_SECRET,
      'deployed-secret-long-enough-to-derive'
    )
    assert.equal(process.env.PIKKU_MOCK_LLM, '0')
  })
})
