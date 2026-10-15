import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTestEnvDefaults } from './backend-harness.js'

const withCleanEnv = (fn: () => void) => {
  const { PIKKU_MOCK_LLM } = process.env
  try {
    fn()
  } finally {
    process.env.PIKKU_MOCK_LLM = PIKKU_MOCK_LLM
  }
}

test('the app defaults are applied without spawning anything', () => {
  withCleanEnv(() => {
    delete process.env.PIKKU_MOCK_LLM
    applyTestEnvDefaults()
    assert.equal(process.env.PIKKU_MOCK_LLM, '1')
  })
})

test('a real-model opt-out survives the defaults', () => {
  withCleanEnv(() => {
    process.env.PIKKU_MOCK_LLM = '0'
    applyTestEnvDefaults()
    assert.equal(process.env.PIKKU_MOCK_LLM, '0')
  })
})
