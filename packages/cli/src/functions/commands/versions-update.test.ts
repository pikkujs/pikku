import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorCode } from '@pikku/inspector'
import { pikkuVersionsUpdate } from './versions-update.js'

describe('pikkuVersionsUpdate', () => {
  test('warns and returns when version manifest is missing', async () => {
    const warnings: string[] = []
    await (pikkuVersionsUpdate as any).func(
      {
        logger: {
          warn: (msg: string) => warnings.push(msg),
          debug: () => {},
        },
        config: { rootDir: '/tmp' },
        getInspectorState: async () => ({
          manifest: {
            initial: null,
            current: null,
            errors: [],
          },
        }),
      },
      undefined,
      {}
    )

    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /pikku versions init/)
  })

  test('logs critical on FUNCTION_VERSION_MODIFIED drift and returns', async () => {
    const warnings: string[] = []
    const criticals: Array<{ code: string; message: string }> = []

    await (pikkuVersionsUpdate as any).func(
      {
        logger: {
          warn: (msg: string) => warnings.push(msg),
          critical: (code: string, message: string) =>
            criticals.push({ code, message }),
          debug: () => {},
        },
        config: { rootDir: '/tmp' },
        getInspectorState: async () => ({
          manifest: {
            initial: { manifestVersion: 1, contracts: {} },
            current: { manifestVersion: 1, contracts: {} },
            errors: [
              {
                code: ErrorCode.FUNCTION_VERSION_MODIFIED,
                message: 'published contract changed',
              },
            ],
          },
        }),
      },
      undefined,
      {}
    )

    assert.equal(warnings.length, 0)
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.FUNCTION_VERSION_MODIFIED)
    assert.equal(criticals[0]!.message, 'published contract changed')
  })
})
