import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTestEnvDefaults } from './backend-harness.js'

const withCleanEnv = (fn: () => void) => {
  const { SCENARIO_VIRTUAL_USER_SECRET, PIKKU_MOCK_LLM } = process.env
  try {
    fn()
  } finally {
    process.env.SCENARIO_VIRTUAL_USER_SECRET = SCENARIO_VIRTUAL_USER_SECRET
    process.env.PIKKU_MOCK_LLM = PIKKU_MOCK_LLM
  }
}

test('the app defaults are applied without spawning anything', () => {
  withCleanEnv(() => {
    delete process.env.SCENARIO_VIRTUAL_USER_SECRET
    delete process.env.PIKKU_MOCK_LLM
    applyTestEnvDefaults()
    const secret = process.env.SCENARIO_VIRTUAL_USER_SECRET ?? ''
    assert.ok(
      secret.length >= 32,
      'a root shorter than key material refuses every virtual user sign-in'
    )
    assert.equal(secret, 'e2e-virtual-user-secret-long-enough-to-derive-from')
    assert.equal(process.env.PIKKU_MOCK_LLM, '1')
  })
})

test('an explicit secret and a real-model opt-out both survive the defaults', () => {
  withCleanEnv(() => {
    process.env.SCENARIO_VIRTUAL_USER_SECRET =
      'deployed-secret-long-enough-to-derive'
    process.env.PIKKU_MOCK_LLM = '0'
    applyTestEnvDefaults()
    assert.equal(
      process.env.SCENARIO_VIRTUAL_USER_SECRET,
      'deployed-secret-long-enough-to-derive'
    )
    assert.equal(process.env.PIKKU_MOCK_LLM, '0')
  })
})
