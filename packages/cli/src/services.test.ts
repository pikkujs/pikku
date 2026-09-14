import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import { CONFIG_FREE_COMMANDS, createConfig } from './services.js'
import { fabricCommands } from './fabric/fabric-commands.js'

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
      /No Pikku config file/
    )
  })
})

describe('CONFIG_FREE_COMMANDS', () => {
  test('every fabric changes subcommand runs outside a pikku project', () => {
    const subcommands = Object.keys(
      (fabricCommands as Record<string, any>).changes.subcommands
    )

    assert.ok(subcommands.length > 0, 'fabric changes has no subcommands')
    for (const name of subcommands) {
      assert.ok(
        CONFIG_FREE_COMMANDS.has(`fabric.changes.${name}`),
        `fabric.changes.${name} is missing from CONFIG_FREE_COMMANDS, so it dies on a missing pikku.config.json before it can read the queue`
      )
    }
    assert.ok(CONFIG_FREE_COMMANDS.has('fabric.changes'))
  })

  test('fabric login runs before there is a project to be inside', () => {
    assert.ok(CONFIG_FREE_COMMANDS.has('fabric.login'))
  })
})
