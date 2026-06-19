import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = () =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }) satisfies InspectorLogger

describe('addCLIRenderers inspector', () => {
  test('extracts destructured renderer services from the callback param', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-cli-renderer-'))
    const file = join(rootDir, 'cli.ts')

    await writeFile(
      file,
      [
        "import { wireCLI, pikkuCLIRender } from '@pikku/core/cli'",
        'export const render = pikkuCLIRender(({ logger }, data) => {',
        '  logger.info(data.message)',
        '})',
        "wireCLI({ program: 'pikku', render, commands: {} })",
      ].join('\n')
    )

    try {
      const state = await inspect(makeLogger(), [file], { rootDir })
      assert.deepEqual(state.cli.meta.renderers['render'], {
        name: 'render',
        exportedName: 'render',
        services: { optimized: true, services: ['logger'] },
        filePath: file,
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('marks non-destructured renderer services as unoptimized', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-cli-renderer-all-'))
    const file = join(rootDir, 'cli.ts')

    await writeFile(
      file,
      [
        "import { wireCLI, pikkuCLIRender } from '@pikku/core/cli'",
        'export const render = pikkuCLIRender((services, data) => {',
        '  services.logger.info(data.message)',
        '})',
        "wireCLI({ program: 'pikku', render, commands: {} })",
      ].join('\n')
    )

    try {
      const state = await inspect(makeLogger(), [file], { rootDir })
      assert.deepEqual(state.cli.meta.renderers['render']?.services, {
        optimized: false,
        services: [],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
