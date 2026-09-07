import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import { createConfig } from './services.js'

const created: string[] = []
let restoreCwd: string | undefined

afterEach(async () => {
  if (restoreCwd) {
    process.chdir(restoreCwd)
    restoreCwd = undefined
  }
  while (created.length) {
    await rm(created.pop()!, { recursive: true, force: true })
  }
})

async function inProjectlessDir() {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-configless-'))
  created.push(dir)
  restoreCwd = process.cwd()
  process.chdir(dir)
  return dir
}

describe('createConfig', () => {
  test('scaffolding a new addon does not demand a project config', async () => {
    await inProjectlessDir()

    const config = await createConfig({} as any, { silent: true } as any, [
      'new',
      'addon',
    ])

    assert.equal(config.scaffold?.addonDir, undefined)
  })

  test('a command that reads the project still demands a config', async () => {
    await inProjectlessDir()

    await assert.rejects(
      createConfig({} as any, { silent: true } as any, ['prebuild']),
      /pikku.config.json not found/
    )
  })
})
