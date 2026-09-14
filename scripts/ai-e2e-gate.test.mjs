import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMarker, shouldRun, touchesAI } from './ai-e2e-gate.mjs'

test('the marker is a bracketed token, not the bare word', () => {
  assert.equal(hasMarker('feat: maintain the available detail again'), false)
  assert.equal(hasMarker('fix(agent): a retry that survives a 429 [ai]'), true)
  assert.equal(hasMarker('[AI] rerun the live scenarios'), true)
})

test('the AI trees are what the live scenarios exercise', () => {
  assert.equal(touchesAI(['packages/services/ai-vercel/src/runner.ts']), true)
  assert.equal(
    touchesAI(['packages/core/src/wirings/agent/run-agent.ts']),
    true
  )
  assert.equal(touchesAI(['packages/voice-agents/src/index.ts']), true)
  assert.equal(
    touchesAI([
      'e2e/packages/functions/tests/scenarios/todo-converse.feature.ts',
    ]),
    true
  )
  assert.equal(
    touchesAI(['packages/core/src/wirings/http/wire-http.ts']),
    false
  )
  assert.equal(touchesAI(['docs/guides/agents.md']), false)
})

test('the gate changing its own mind is itself an AI change', () => {
  assert.equal(touchesAI(['scripts/ai-e2e-gate.mjs']), true)
  assert.equal(touchesAI(['.github/workflows/develop.yml']), true)
})

test('either signal alone is enough, and neither means skip', () => {
  assert.equal(
    shouldRun({ message: 'chore: bump deps', files: ['package.json'] }),
    false
  )
  assert.equal(
    shouldRun({ message: 'chore: bump deps [ai]', files: ['package.json'] }),
    true
  )
  assert.equal(
    shouldRun({
      message: 'chore: bump deps',
      files: ['packages/voice-agents/a.ts'],
    }),
    true
  )
})
