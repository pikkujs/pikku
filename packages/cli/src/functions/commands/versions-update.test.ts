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

  test('throws on FUNCTION_VERSION_MODIFIED drift', async () => {
    const warnings: string[] = []

    await assert.rejects(
      () =>
        (pikkuVersionsUpdate as any).func(
          {
            logger: {
              warn: (msg: string) => warnings.push(msg),
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
        ),
      /immutable published contract drift/
    )

    assert.equal(warnings.length, 2)
    assert.match(warnings[0]!, new RegExp(ErrorCode.FUNCTION_VERSION_MODIFIED))
    assert.match(warnings[1]!, /Contract drift detected/)
  })
})
