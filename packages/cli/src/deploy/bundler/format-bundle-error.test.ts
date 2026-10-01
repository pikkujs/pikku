import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBundleError } from './format-bundle-error.js'

describe('formatBundleError', () => {
  test('renders esbuild text and location instead of [object Object]', () => {
    const err = Object.assign(new Error('Build failed with 1 error'), {
      errors: [
        {
          text: 'Could not resolve "node:fs"',
          location: { file: 'src/a.ts', line: 3, column: 7 },
        },
      ],
    })
    const out = formatBundleError(err)
    assert.ok(!out.includes('[object Object]'))
    assert.match(out, /Could not resolve "node:fs" \(src\/a\.ts:3:7\)/)
  })

  test('renders Bun-style message errors', () => {
    const err = Object.assign(new Error('Bundle failed'), {
      errors: [{ message: 'boom' }, 'plain'],
    })
    assert.equal(formatBundleError(err), 'Bundle failed\n  boom\n  plain')
  })

  test('falls back to JSON for unknown objects and plain errors', () => {
    const err = Object.assign(new Error('x'), { errors: [{ foo: 1 }] })
    assert.equal(formatBundleError(err), 'x\n  {"foo":1}')
    assert.equal(formatBundleError(new Error('only')), 'only')
    assert.equal(formatBundleError('str'), 'str')
  })
})
