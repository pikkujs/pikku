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

  test('emits an error diagnostic on FUNCTION_VERSION_MODIFIED drift without exiting or saving', async () => {
    const warnings: string[] = []
    const diagnostics: Array<{
      severity: string
      code: string
      message: string
    }> = []
    const exits: Array<string | number | null | undefined> = []
    const originalExit = process.exit

    process.exit = ((code?: string | number | null | undefined) => {
      exits.push(code)
      throw new Error('process.exit called')
    }) as typeof process.exit

    try {
      await (pikkuVersionsUpdate as any).func(
        {
          logger: {
            warn: (msg: string) => warnings.push(msg),
            diagnostic: (d: {
              severity: string
              code: string
              message: string
            }) => diagnostics.push(d),
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
    } finally {
      process.exit = originalExit
    }

    assert.equal(warnings.length, 0)
    // Contract drift is surfaced but non-blocking: no process.exit, no save.
    assert.deepEqual(exits, [])
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]!.severity, 'error')
    assert.equal(diagnostics[0]!.code, ErrorCode.FUNCTION_VERSION_MODIFIED)
    assert.equal(diagnostics[0]!.message, 'published contract changed')
  })
})
