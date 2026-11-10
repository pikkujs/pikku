import { describe, test, expect } from 'bun:test'
import { isPerBackendCopy } from './build-surface-doc.js'

describe('isPerBackendCopy', () => {
  test('skips the per-backend copies of a leaf and the SDK tree, keeps the shared leaves', () => {
    expect(isPerBackendCopy('#pikku/backends/app/http')).toBe(true)
    expect(isPerBackendCopy('#pikku/sdk/app/exposed')).toBe(true)
    expect(isPerBackendCopy('#pikku/http')).toBe(false)
    expect(isPerBackendCopy('#pikku/addon')).toBe(false)
  })
})
