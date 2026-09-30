import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { createConfig } from './services.js'

describe('createConfig --config', () => {
  const tempDirs: string[] = []
  const originalCwd = process.cwd()

  after(() => {
    process.chdir(originalCwd)
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const project = async () => {
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
})
