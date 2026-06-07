import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { rmSync } from 'node:fs'
import { getPikkuCLIConfig } from './pikku-cli-config.js'

describe('getPikkuCLIConfig', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('preserves db.engine and db.pgVersion from pikku.config.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-config-'))
    tempDirs.push(root)

    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
      join(root, 'pikku.config.json'),
      JSON.stringify(
        {
          rootDir: '.',
          srcDirectories: ['src'],
          packageMappings: {},
          outDir: '.pikku',
          tsconfig: 'tsconfig.json',
          db: {
            engine: 'postgres',
            pgVersion: 18,
          },
          filters: {},
        },
        null,
        2
      )
    )

    const logger = {
      error() {},
      warn() {},
      info() {},
    }

    const config = await getPikkuCLIConfig(
      logger as never,
      join(root, 'pikku.config.json'),
      [],
      false
    )

    assert.deepStrictEqual(config.db, { engine: 'postgres', pgVersion: 18 })
  })
})
