import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { executeCLI } from '@pikku/core/cli'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import {
  checkCoreCompatibility,
  discoverCLIExtensions,
  mountCLIExtensions,
  selectCLIExtensions,
} from './cli-extensions.js'

const hostCoreRoot = (): string => {
  const entry = createRequire(import.meta.url).resolve('@pikku/core/state')
  return realpathSync(dirname(dirname(entry)))
}

const hostCoreVersion = (): string =>
  JSON.parse(readFileSync(join(hostCoreRoot(), 'package.json'), 'utf-8'))
    .version

type Layout = {
  root: string
  cliDir: string
  extDir: string
}

const writeJSON = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

const buildLayout = (
  root: string,
  options: {
    extCore: 'shared' | 'own-copy' | 'own-copy-other-version'
    corePeerRange?: string
  }
): Layout => {
  const globalModules = join(root, 'global', 'node_modules')
  const cliDir = join(globalModules, '@pikku', 'cli')
  const extDir = join(globalModules, 'fake-ui-ext')
  mkdirSync(join(globalModules, '@pikku'), { recursive: true })
  symlinkSync(hostCoreRoot(), join(globalModules, '@pikku', 'core'), 'dir')
  writeJSON(join(cliDir, 'package.json'), {
    name: '@pikku/cli',
    version: '0.0.0',
    dependencies: { 'fake-ui-ext': '1.0.0', 'not-an-extension': '1.0.0' },
  })
  writeJSON(join(globalModules, 'not-an-extension', 'package.json'), {
    name: 'not-an-extension',
  })
  writeJSON(join(extDir, 'package.json'), {
    name: 'fake-ui-ext',
    version: '1.0.0',
    type: 'module',
    pikku: { cli: { name: 'fakeui' } },
    exports: { './cli': { import: './cli.js', default: './cli.js' } },
    peerDependencies: {
      '@pikku/core': options.corePeerRange ?? '*',
    },
  })
  writeFileSync(
    join(extDir, 'cli.js'),
    `import { pikkuState } from '@pikku/core/state'
pikkuState('fake-ui-ext', 'function', 'meta', {
  FakeHi: { pikkuFuncId: 'FakeHi', inputSchemaName: null, outputSchemaName: null, sessionless: true },
})
pikkuState('fake-ui-ext', 'function', 'functions').set('FakeHi', {
  func: async (_services, data) => ({ greeting: 'hi ' + data.who }),
  auth: false,
})
export const cliExtension = {
  name: 'fakeui',
  packageName: 'fake-ui-ext',
  meta: {
    pikkuFuncId: '',
    positionals: [],
    options: {},
    description: 'Fake UI tools',
    subcommands: {
      hi: { pikkuFuncId: 'FakeHi', positionals: [{ name: 'who', required: true }], options: {} },
    },
  },
  commands: { hi: { func: async (_s, d) => ({ greeting: 'hi ' + d.who }), auth: false } },
}
`
  )
  if (
    options.extCore === 'own-copy' ||
    options.extCore === 'own-copy-other-version'
  ) {
    const copy = join(extDir, 'node_modules', '@pikku', 'core')
    mkdirSync(copy, { recursive: true })
    cpSync(join(hostCoreRoot(), 'dist'), join(copy, 'dist'), {
      recursive: true,
    })
    const manifest = JSON.parse(
      readFileSync(join(hostCoreRoot(), 'package.json'), 'utf-8')
    )
    if (options.extCore === 'own-copy-other-version') {
      manifest.version = '0.0.1'
    }
    writeJSON(join(copy, 'package.json'), manifest)
  }
  return { root, cliDir, extDir }
}

const seedProgram = (): void => {
  pikkuState(null, 'cli', 'meta', {
    programs: {
      pikku: {
        program: 'pikku',
        commands: { all: { pikkuFuncId: 'all', positionals: [], options: {} } },
        options: {},
      },
    },
    renderers: {},
  } as any)
  pikkuState(null, 'cli', 'programs', {
    pikku: {
      defaultRenderer: (_s: any, data: any) =>
        console.log(JSON.stringify(data)),
      middleware: [],
      renderers: {},
    },
  } as any)
}

describe('cli extension loader', () => {
  let root: string

  beforeEach(() => {
    resetPikkuState()
    seedProgram()
    root = mkdtempSync(join(tmpdir(), 'pikku-cli-ext-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    resetPikkuState()
  })

  test('discovers dependencies that declare pikku.cli and ignores the rest', () => {
    const { cliDir } = buildLayout(root, { extCore: 'shared' })
    const found = discoverCLIExtensions(cliDir)
    assert.deepEqual(
      found.map((ext) => [ext.packageName, ext.commandName]),
      [['fake-ui-ext', 'fakeui']]
    )
  })

  test('discovers nothing when the CLI has no extension dependencies', () => {
    const dir = join(root, 'empty')
    writeJSON(join(dir, 'package.json'), { name: '@pikku/cli' })
    assert.deepEqual(discoverCLIExtensions(dir), [])
  })

  describe('argv peek', () => {
    const ext = [
      { packageName: 'a', commandName: 'ui', packageJsonPath: '/a' },
      { packageName: 'b', commandName: 'other', packageJsonPath: '/b' },
    ]
    const builtIns = new Set(['all', 'dev'])

    test('built-in commands load nothing', () => {
      assert.deepEqual(selectCLIExtensions(['all'], builtIns, ext), [])
      assert.deepEqual(selectCLIExtensions(['-v', 'dev'], builtIns, ext), [])
    })

    test('no command or only flags loads every extension', () => {
      assert.equal(selectCLIExtensions([], builtIns, ext).length, 2)
      assert.equal(selectCLIExtensions(['--help'], builtIns, ext).length, 2)
    })

    test('an extension name loads only that extension', () => {
      assert.deepEqual(
        selectCLIExtensions(['ui', 'theme', 'list'], builtIns, ext).map(
          (e) => e.packageName
        ),
        ['a']
      )
    })

    test('an unknown command loads nothing', () => {
      assert.deepEqual(selectCLIExtensions(['nope'], builtIns, ext), [])
    })
  })

  test('built-in commands never import the extension', async () => {
    const { cliDir } = buildLayout(root, { extCore: 'shared' })
    const mounted = await mountCLIExtensions({
      argv: ['all'],
      cliPackageDir: cliDir,
    })
    assert.deepEqual(mounted, [])
    assert.equal(
      pikkuState(null, 'cli', 'meta').programs.pikku.commands.fakeui,
      undefined
    )
  })

  test('mounts and runs a command from an extension that shares the CLI core', async () => {
    const { cliDir } = buildLayout(root, { extCore: 'shared' })
    const mounted = await mountCLIExtensions({
      argv: ['fakeui', 'hi', 'there'],
      cliPackageDir: cliDir,
    })
    assert.equal(mounted.length, 1)
    const out: string[] = []
    const realLog = console.log
    console.log = (...args: unknown[]) => void out.push(args.join(' '))
    try {
      await executeCLI({
        programName: 'pikku',
        args: ['fakeui', 'hi', 'there'],
        createSingletonServices: async () => ({ logger: console }) as any,
      })
    } finally {
      console.log = realLog
    }
    assert.deepEqual(JSON.parse(out.at(-1)!), { greeting: 'hi there' })
  })

  test('a global-style install with a separate copy of the same core version works', async () => {
    const { cliDir, extDir } = buildLayout(root, { extCore: 'own-copy' })
    const mounted = await mountCLIExtensions({
      argv: ['fakeui', 'hi', 'there'],
      cliPackageDir: cliDir,
    })
    assert.equal(mounted.length, 1)
    assert.notEqual(
      realpathSync(join(extDir, 'node_modules', '@pikku', 'core')),
      hostCoreRoot()
    )
    assert.ok(pikkuState('fake-ui-ext', 'function', 'functions').has('FakeHi'))
    const out: string[] = []
    const realLog = console.log
    console.log = (...args: unknown[]) => void out.push(args.join(' '))
    try {
      await executeCLI({
        programName: 'pikku',
        args: ['fakeui', 'hi', 'copy'],
        createSingletonServices: async () => ({ logger: console }) as any,
      })
    } finally {
      console.log = realLog
    }
    assert.deepEqual(JSON.parse(out.at(-1)!), { greeting: 'hi copy' })
  })

  test('a separate copy at another core version is refused loudly when its command is run', async () => {
    const { cliDir } = buildLayout(root, { extCore: 'own-copy-other-version' })
    await assert.rejects(
      mountCLIExtensions({
        argv: ['fakeui', 'hi', 'x'],
        cliPackageDir: cliDir,
      }),
      (error: Error) =>
        error.message.includes('0.0.1') &&
        error.message.includes(hostCoreVersion()) &&
        error.message.includes('share one pikkuState')
    )
    assert.equal(
      pikkuState(null, 'cli', 'meta').programs.pikku.commands.fakeui,
      undefined
    )
  })

  test('the same skew only warns when listing every command', async () => {
    const { cliDir } = buildLayout(root, { extCore: 'own-copy-other-version' })
    const warnings: string[] = []
    const mounted = await mountCLIExtensions({
      argv: ['--help'],
      cliPackageDir: cliDir,
      logger: { warn: (message) => void warnings.push(message) },
    })
    assert.deepEqual(mounted, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /Skipped the "fakeui" commands/)
  })

  test('an extension whose core peer range excludes the CLI core is refused', async () => {
    const { cliDir } = buildLayout(root, {
      extCore: 'shared',
      corePeerRange: '^0.1.0',
    })
    await assert.rejects(
      mountCLIExtensions({ argv: ['fakeui'], cliPackageDir: cliDir }),
      /requires @pikku\/core \^0\.1\.0/
    )
  })

  test('checkCoreCompatibility accepts the same copy and rejects an unresolvable core', () => {
    const host = { root: '/x', version: '1.0.0' }
    const ext = {
      packageName: 'p',
      commandName: 'p',
      packageJsonPath: '/p/package.json',
    }
    assert.equal(checkCoreCompatibility(ext, host, host), undefined)
    assert.match(
      checkCoreCompatibility(ext, host, undefined) ?? '',
      /cannot resolve @pikku\/core/
    )
  })
})
