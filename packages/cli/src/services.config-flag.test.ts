import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { createConfig } from './services.js'
import { getInspectorEngine } from './inspector-engine.js'

describe('createConfig --config', () => {
  const tempDirs: string[] = []
  const originalCwd = process.cwd()

  after(() => {
    process.chdir(originalCwd)
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const project = async (extra: Record<string, unknown> = {}) => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-config-flag-'))
    tempDirs.push(root)
    await mkdir(join(root, 'backend', 'src'), { recursive: true })
    await writeFile(
      join(root, 'backend', 'pikku.config.json'),
      JSON.stringify({
        rootDir: '.',
        srcDirectories: ['src'],
        packageMappings: {},
        outDir: '.pikku',
        tsconfig: 'tsconfig.json',
        filters: {},
        ...extra,
      })
    )
    return root
  }

  test('a config passed by path is read from another directory, and its relative fields resolve against it', async () => {
    const root = await project()
    const elsewhere = await mkdtemp(join(tmpdir(), 'pikku-elsewhere-'))
    tempDirs.push(elsewhere)
    process.chdir(elsewhere)

    const config = await createConfig(
      undefined as never,
      {
        config: join(root, 'backend', 'pikku.config.json'),
        output: 'text',
      } as never
    )

    assert.equal(config.configDir, join(root, 'backend'))
    assert.equal(config.outDir, join(root, 'backend', '.pikku'))
  })

  describe('inspector', () => {
    const withEnv = async <T>(
      value: string | undefined,
      run: () => Promise<T>
    ) => {
      const previous = process.env.PIKKU_INSPECTOR
      if (value === undefined) delete process.env.PIKKU_INSPECTOR
      else process.env.PIKKU_INSPECTOR = value
      try {
        return await run()
      } finally {
        if (previous === undefined) delete process.env.PIKKU_INSPECTOR
        else process.env.PIKKU_INSPECTOR = previous
      }
    }

    const configFor = async (
      configValue: string | undefined,
      flag: string | undefined
    ) => {
      const root = await project(configValue ? { inspector: configValue } : {})
      return createConfig(
        undefined as never,
        {
          config: join(root, 'backend', 'pikku.config.json'),
          output: 'text',
          ...(flag ? { inspector: flag } : {}),
        } as never
      )
    }

    test('defaults to typescript and records it for the helpers', async () => {
      const config = await withEnv(undefined, () =>
        configFor(undefined, undefined)
      )
      assert.equal(config.inspector, 'typescript')
      assert.equal(getInspectorEngine(), 'typescript')
    })

    test('the config key selects native', async () => {
      const config = await withEnv(undefined, () =>
        configFor('native', undefined)
      )
      assert.equal(config.inspector, 'native')
      assert.equal(getInspectorEngine(), 'native')
    })

    test('PIKKU_INSPECTOR beats the config key', async () => {
      const config = await withEnv('native', () =>
        configFor('typescript', undefined)
      )
      assert.equal(config.inspector, 'native')
    })

    test('--inspector beats PIKKU_INSPECTOR and the config key', async () => {
      const config = await withEnv('native', () =>
        configFor('native', 'typescript')
      )
      assert.equal(config.inspector, 'typescript')
    })
  })
})
