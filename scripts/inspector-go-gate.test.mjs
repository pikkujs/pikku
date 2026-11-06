import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMarker, shouldRun, touchesGo } from './inspector-go-gate.mjs'

test('the marker is a bracketed token, not the bare word', () => {
  assert.equal(hasMarker('fix(inspector-go): a shim'), false)
  assert.equal(hasMarker('chore: bump a pin [inspector-go]'), true)
})

test('the package and what drives the job are what count', () => {
  assert.equal(touchesGo(['packages/inspector-go/go.mod']), true)
  assert.equal(touchesGo(['.github/workflows/develop.yml']), true)
  assert.equal(touchesGo(['scripts/inspector-go-gate.mjs']), true)
  assert.equal(touchesGo(['packages/inspector/src/types.ts']), false)
  assert.equal(touchesGo(['packages/core/src/index.ts']), false)
  assert.equal(touchesGo([]), false)
})

test('either signal is enough', () => {
  assert.equal(shouldRun({ message: '[inspector-go]', files: [] }), true)
  assert.equal(
    shouldRun({ message: '', files: ['packages/inspector-go/go.mod'] }),
    true
  )
  assert.equal(
    shouldRun({ message: 'fix(core): x', files: ['packages/core/src/a.ts'] }),
    false
  )
})
