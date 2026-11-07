import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalVariablesService } from '@pikku/core/services'
import { callUserCreateConfig } from './call-user-create-config.js'
import { loadUserConfigForDb } from '../functions/commands/db-shared.js'

describe('callUserCreateConfig', () => {
  test('hands the variables service to the factory as its first argument', async () => {
    const variables = new LocalVariablesService({ API_PORT: '5000' })
    let received: unknown
    const config = await callUserCreateConfig(async (v) => {
      received = v
      return { port: v.get('API_PORT') }
    }, variables)
    assert.equal(received, variables)
    assert.deepEqual(config, { port: 5000 })
  })
})

describe('loadUserConfigForDb', () => {
  test("gives the project's createConfig the variables service", async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-create-config-'))
    const previous = process.env.PIKKU_TEST_SQLITE_FILE
    try {
      await mkdir(join(root, 'src'), { recursive: true })
      await writeFile(
        join(root, 'src', 'config.ts'),
        "export const createConfig = async (variables?: any) => ({ sqliteDb: variables ? String(variables.get('PIKKU_TEST_SQLITE_FILE')) : 'no-variables' })\n"
      )
      process.env.PIKKU_TEST_SQLITE_FILE = 'from-variables.db'
      const config = await loadUserConfigForDb({
        config: { rootDir: root, srcDirectories: ['src'] },
        logger: { error: () => {}, warn: () => {} },
      })
      assert.equal(config?.sqliteDb, 'from-variables.db')
    } finally {
      if (previous === undefined) delete process.env.PIKKU_TEST_SQLITE_FILE
      else process.env.PIKKU_TEST_SQLITE_FILE = previous
      await rm(root, { recursive: true, force: true })
    }
  })
})
