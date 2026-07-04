import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

describe('pikkuTestServices / pikkuTestWireServices discovery', () => {
  test('inspector records test service factories like other factories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-testsvc-'))
    const file = join(rootDir, 'test-services.ts')
    await writeFile(
      file,
      [
        'const pikkuTestServices = (f: any) => f',
        'const pikkuTestWireServices = (f: any) => f',
        '',
        'export const createTestServices = pikkuTestServices(',
        '  async (_services: any, { stub }: any) => ({',
        "    email: stub('email', { send: async () => ({ ok: true }) }),",
        '  })',
        ')',
        '',
        'export const createTestWireServices = pikkuTestWireServices(',
        '  async (_services: any, _wire: any, { stub }: any) => ({})',
        ')',
      ].join('\n')
    )
    try {
      const state = await inspect(logger, [file], { rootDir })
      const testFactories = Array.from(
        (state as any).testServicesFactories?.values() ?? []
      ).flat() as any[]
      const testWireFactories = Array.from(
        (state as any).testWireServicesFactories?.values() ?? []
      ).flat() as any[]
      assert.equal(
        testFactories[0]?.variable,
        'createTestServices',
        'pikkuTestServices factory should be discovered'
      )
      assert.equal(
        testWireFactories[0]?.variable,
        'createTestWireServices',
        'pikkuTestWireServices factory should be discovered'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
