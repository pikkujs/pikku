import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { executeCLI, runCLICommand } from './cli-runner.js'
import { mountCLICommands } from './mount-cli-commands.js'
import { generateCommandHelp } from './command-parser.js'

const writeDummyTarget = (root: string): string => {
  const dir = join(root, 'node_modules', '@pikku', 'deploy-dummy')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: '@pikku/deploy-dummy',
      type: 'module',
      main: 'index.js',
    })
  )
  writeFileSync(
    join(dir, 'index.js'),
    `export const cliMeta = {
  pikkuFuncId: '',
  positionals: [],
  options: {},
  description: 'Dummy target commands',
  subcommands: {
    hello: {
      pikkuFuncId: 'dummyHello',
      positionals: [{ name: 'who', required: true }],
      options: {},
    },
  },
}
export const commands = {
  hello: {
    func: async (_services, data) => ({ greeting: 'hello ' + data.who }),
    auth: false,
  },
}
`
  )
  return dir
}

describe('mountCLICommands', () => {
  let root: string
  let out: unknown[]
  const realLog = console.log

  beforeEach(() => {
    resetPikkuState()
    root = mkdtempSync(join(tmpdir(), 'pikku-mount-'))
    out = []
    console.log = (...args: unknown[]) => void out.push(args.join(' '))
    pikkuState(null, 'cli', 'meta', {
      programs: {
        pikku: { program: 'pikku', commands: {}, options: {} },
      },
      renderers: {},
    })
    pikkuState(null, 'cli', 'programs', {
      pikku: {
        defaultRenderer: (_s: any, data: any) =>
          console.log(JSON.stringify(data)),
        middleware: [],
        renderers: {},
      },
    })
    pikkuState(null, 'function', 'meta', {
      dummyHello: {
        pikkuFuncId: 'dummyHello',
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      },
    })
  })

  afterEach(() => {
    console.log = realLog
    rmSync(root, { recursive: true, force: true })
    resetPikkuState()
  })

  test('mounts an installed package group and runs it without a rebuild', async () => {
    const dir = writeDummyTarget(root)
    const mod = await import(pathToFileURL(join(dir, 'index.js')).href)

    mountCLICommands({
      program: 'pikku',
      name: 'dummy',
      meta: mod.cliMeta,
      commands: mod.commands,
    })

    const meta = pikkuState(null, 'cli', 'meta') as any
    const help = generateCommandHelp('pikku', meta, ['dummy'])
    assert.ok(help.includes('hello'))

    await executeCLI({
      programName: 'pikku',
      args: ['dummy', 'hello', 'world'],
      createSingletonServices: async () => ({ logger: console }) as any,
    })
    assert.deepStrictEqual(
      out.at(-1),
      JSON.stringify({ greeting: 'hello world' })
    )
  })

  test('refuses to shadow an existing command', () => {
    const meta = pikkuState(null, 'cli', 'meta') as any
    meta.programs.pikku.commands.dummy = {
      pikkuFuncId: 'x',
      positionals: [],
      options: {},
    }
    assert.throws(() =>
      mountCLICommands({
        program: 'pikku',
        name: 'dummy',
        meta: { pikkuFuncId: '', positionals: [], options: {} },
        commands: {},
      })
    )
  })

  const mountPackageCommand = (commandConfig: Record<string, any>) => {
    const packageName = '@pikku/dummy-package'
    pikkuState(packageName, 'function', 'meta', {
      pkgEcho: {
        pikkuFuncId: 'pkgEcho',
        inputSchemaName: 'PkgEchoInput',
        outputSchemaName: null,
        sessionless: true,
      },
    })
    pikkuState(packageName, 'function', 'functions').set('pkgEcho', {
      func: async (_services: any, data: any) => ({ ...data, ran: 'package' }),
    } as any)
    pikkuState(packageName, 'misc', 'schemas').set('PkgEchoInput', {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    })
    mountCLICommands({
      program: 'pikku',
      name: 'pkg',
      packageName,
      meta: {
        pikkuFuncId: '',
        positionals: [],
        options: {},
        subcommands: {
          echo: { pikkuFuncId: 'pkgEcho', positionals: [], options: {} },
        },
      },
      commands: { echo: { func: async () => ({}), ...commandConfig } },
    })
    return packageName
  }

  test('command-level auth is enforced on a package function', async () => {
    mountPackageCommand({ auth: true })
    await assert.rejects(
      runCLICommand({
        program: 'pikku',
        commandPath: ['pkg', 'echo'],
        data: {},
        singletonServices: { logger: console } as any,
      }),
      (error: any) => error.constructor.name === 'MissingSessionError'
    )
  })

  test('input is shaped by the schema of the command package', async () => {
    mountPackageCommand({ auth: false })
    await runCLICommand({
      program: 'pikku',
      commandPath: ['pkg', 'echo'],
      data: { tags: 'a,b', extra: 'dropped' },
      singletonServices: { logger: console } as any,
    })
    assert.deepStrictEqual(
      out.at(-1),
      JSON.stringify({ tags: ['a', 'b'], ran: 'package' })
    )
  })
})
