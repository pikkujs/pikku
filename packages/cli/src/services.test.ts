import assert from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import { serializeInspectorState } from '@pikku/inspector'
import {
  CONFIG_FREE_COMMANDS,
  createConfig,
  createSingletonServices,
} from './services.js'
import { changesCommands } from './fabric/changes-commands.js'

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
      /No pikku.config.json/
    )
  })
})

describe('CONFIG_FREE_COMMANDS', () => {
  test('every changes subcommand runs outside a pikku project', () => {
    const subcommands = Object.keys(changesCommands)

    assert.ok(subcommands.length > 0, 'changes has no subcommands')
    for (const name of subcommands) {
      assert.ok(
        CONFIG_FREE_COMMANDS.has(`changes.${name}`),
        `changes.${name} is missing from CONFIG_FREE_COMMANDS, so it dies on a missing pikku.config.json before it can read the queue`
      )
    }
    assert.ok(CONFIG_FREE_COMMANDS.has('changes'))
  })

  test('fabric login runs before there is a project to be inside', () => {
    assert.ok(CONFIG_FREE_COMMANDS.has('fabric.login'))
  })
})

describe('loadInspectorStateFile', () => {
  test('a state file written by a codegen child becomes the inspector state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-state-'))
    created.push(dir)
    const { inspect } = await import('@pikku/inspector')
    const state = await inspect(console as any, [], { rootDir: dir } as any)
    const file = join(dir, 'state.json')
    await writeFile(
      file,
      JSON.stringify(serializeInspectorState(state as any)),
      'utf-8'
    )
    const services = await createSingletonServices({
      rootDir: dir,
      srcDirectories: [],
      filters: {},
    } as any)
    await services.loadInspectorStateFile(file)
    const loaded = await services.getInspectorState(false, false, false, true)
    assert.ok('functions' in loaded)
    assert.equal(loaded.rootDir, state.rootDir)
  })
})
