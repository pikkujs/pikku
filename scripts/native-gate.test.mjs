import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMarker, shouldRun, touchesNative } from './native-gate.mjs'

test('the marker is a bracketed token, not the bare word', () => {
  assert.equal(hasMarker('feat: native fetch in the client'), false)
  assert.equal(hasMarker('fix(app): a plugin init [native]'), true)
})

test('the native trees are what the native jobs exercise', () => {
  assert.equal(
    touchesNative(['packages/deploy/deploy-standalone/src/tauri/rust.ts']),
    true
  )
  assert.equal(touchesNative(['packages/cli/src/functions/app/run.ts']), true)
  assert.equal(touchesNative(['e2e/packages/web/src/main.tsx']), true)
  assert.equal(touchesNative(['e2e/pikku.config.json']), true)
  assert.equal(
    touchesNative(['packages/deploy/deploy-standalone/src/adapter.ts']),
    false
  )
  assert.equal(touchesNative(['e2e/packages/functions/src/index.ts']), false)
})

test('either signal is enough', () => {
  assert.equal(shouldRun({ message: '[native]', files: [] }), true)
  assert.equal(
    shouldRun({ message: '', files: ['e2e/packages/web/src/main.tsx'] }),
    true
  )
  assert.equal(shouldRun({ message: '', files: ['README.md'] }), false)
})
