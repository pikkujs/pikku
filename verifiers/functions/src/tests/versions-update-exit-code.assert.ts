import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { pikkuVersionsUpdate } from '../../../../packages/cli/src/functions/commands/versions-update.js'

describe('versions-update verifier', () => {
  test('exits with code 1 when immutable contract drift is detected', async () => {
    const criticals: Array<{ code: string; message: string }> = []
    const exits: Array<string | number | null | undefined> = []
    const originalExit = process.exit

    process.exit = ((code?: string | number | null | undefined) => {
      exits.push(code)
      throw new Error('process.exit called')
    }) as typeof process.exit

    try {
      await assert.rejects(
        () =>
          (pikkuVersionsUpdate as any).func(
            {
              logger: {
                warn: () => {},
                debug: () => {},
                critical: (code: string, message: string) =>
                  criticals.push({ code, message }),
                hasCriticalErrors: () => true,
              },
              config: { rootDir: '/tmp' },
              getInspectorState: async () => ({
                manifest: {
                  initial: { manifestVersion: 1, contracts: {} },
                  current: { manifestVersion: 1, contracts: {} },
                  errors: [{ code: 'PKU861', message: 'published drift' }],
                },
              }),
            },
            undefined,
            {}
          ),
        /process\.exit called/
      )
    } finally {
      process.exit = originalExit
    }

    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, 'PKU861')
    assert.equal(criticals[0]!.message, 'published drift')
    assert.deepEqual(exits, [1])
  })
})
