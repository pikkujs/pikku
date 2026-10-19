import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ADDONS_LOCK_FILE,
  SDK_INTEGRITY_MARKER,
  checkLockedSdk,
  parseRemoteAddonPackage,
  readAddonsLock,
  remoteSdkDir,
  serializeAddonsLock,
} from './remote-addon-sdk.js'
import { findWireRemoteAddonSpecs } from './find-wire-remote-addon-specs.js'
import { validateRemoteAddonDependencies } from './post-process.js'
import { loadAddonFunctionsMeta } from './load-addon-functions-meta.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

const NAME = '@pikkustudio/addon-cloud-api'
const INTEGRITY = 'sha512-AAAA'

/** A project whose lock pins NAME@1.4.2 for '^1.4.0', with the SDK extracted. */
const makeProject = (
  opts: {
    lockRange?: string
    marker?: string | null
    manifestVersion?: string
  } = {}
) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-remote-sdk-'))
  writeFileSync(
    join(rootDir, ADDONS_LOCK_FILE),
    serializeAddonsLock({
      lockfileVersion: 1,
      sdks: {
        [NAME]: {
          range: opts.lockRange ?? '^1.4.0',
          version: '1.4.2',
          integrity: INTEGRITY,
        },
      },
    })
  )
  const dir = remoteSdkDir(rootDir, NAME, '1.4.2')
  mkdirSync(join(dir, 'function'), { recursive: true })
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      name: NAME,
      version: opts.manifestVersion ?? '1.4.2',
      pikkuCore: '^0.12.0',
      contractHash: 'abc',
    })
  )
  writeFileSync(
    join(dir, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({ getProject: { pikkuFuncId: 'getProject', remote: true } })
  )
  if (opts.marker !== null) {
    writeFileSync(join(dir, SDK_INTEGRITY_MARKER), opts.marker ?? INTEGRITY)
  }
  return { rootDir, dir }
}

const makeLogger = () => {
  const criticals: { code: string; message: string }[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code: any, message: string) =>
      criticals.push({ code: String(code), message }),
    diagnostic: () => {},
  } as unknown as InspectorLogger
  return { logger, criticals }
}

const stateFor = (rootDir: string, range: string | undefined) =>
  ({
    rootDir,
    addonFunctions: {},
    rpc: {
      wireAddonDeclarations: new Map([
        [
          'cloudapi',
          { package: NAME, remote: true, ...(range ? { range } : {}) },
        ],
      ]),
    },
  }) as unknown as InspectorState

describe('parseRemoteAddonPackage (inspector copy)', () => {
  test('agrees with core on scoped, unscoped and bare names', () => {
    assert.deepEqual(parseRemoteAddonPackage(`${NAME}@^1.4.0`), {
      name: NAME,
      range: '^1.4.0',
    })
    assert.deepEqual(parseRemoteAddonPackage('mail@1.0.0'), {
      name: 'mail',
      range: '1.0.0',
    })
    assert.deepEqual(parseRemoteAddonPackage(NAME), { name: NAME })
  })
})

describe('serializeAddonsLock', () => {
  test('sorts packages and fixes key order, so the same lock writes the same bytes', () => {
    const a = serializeAddonsLock({
      lockfileVersion: 1,
      sdks: {
        'z-addon': {
          integrity: 'sha512-z',
          version: '1.0.0',
          range: '^1',
        } as any,
        'a-addon': { version: '2.0.0', range: '^2', integrity: 'sha512-a' },
      },
    })
    assert.equal(
      a,
      `{
  "lockfileVersion": 1,
  "sdks": {
    "a-addon": {
      "range": "^2",
      "version": "2.0.0",
      "integrity": "sha512-a"
    },
    "z-addon": {
      "range": "^1",
      "version": "1.0.0",
      "integrity": "sha512-z"
    }
  }
}
`
    )
  })

  test('a missing lock reads as empty', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-remote-sdk-'))
    try {
      assert.deepEqual(readAddonsLock(rootDir).sdks, {})
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

describe('checkLockedSdk', () => {
  test('ok when the lock, the marker and the manifest agree', () => {
    const { rootDir, dir } = makeProject()
    try {
      const locked = checkLockedSdk(rootDir, NAME, '^1.4.0')
      assert.equal(locked.ok, true)
      assert.equal(locked.ok && locked.dir, dir)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('stale when the spec moved to a range the lock was not written for', () => {
    const { rootDir } = makeProject()
    try {
      const locked = checkLockedSdk(rootDir, NAME, '^1.6.0')
      assert.equal(locked.ok, false)
      assert.match(!locked.ok ? locked.reason : '', /resolved for '\^1\.4\.0'/)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('stale when the files came from another tarball', () => {
    const { rootDir } = makeProject({ marker: 'sha512-BBBB' })
    try {
      assert.equal(checkLockedSdk(rootDir, NAME, '^1.4.0').ok, false)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('stale when the SDK was never extracted', () => {
    const { rootDir } = makeProject({ marker: null })
    try {
      const locked = checkLockedSdk(rootDir, NAME, '^1.4.0')
      assert.match(!locked.ok ? locked.reason : '', /missing/)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('stale when the manifest names another version', () => {
    const { rootDir } = makeProject({ manifestVersion: '1.4.1' })
    try {
      assert.equal(checkLockedSdk(rootDir, NAME, '^1.4.0').ok, false)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

describe('validateRemoteAddonDependencies (versioned wireRemoteAddon)', () => {
  test('passes with the locked SDK on disk and no devDependency', () => {
    const { rootDir } = makeProject()
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({}))
    try {
      const { logger, criticals } = makeLogger()
      validateRemoteAddonDependencies(logger, stateFor(rootDir, '^1.4.0'))
      assert.deepEqual(criticals, [])
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('PKU338 when the SDK does not match the lock', () => {
    const { rootDir } = makeProject({ marker: 'sha512-BBBB' })
    try {
      const { logger, criticals } = makeLogger()
      validateRemoteAddonDependencies(logger, stateFor(rootDir, '^1.4.0'))
      assert.equal(criticals.length, 1)
      assert.equal(
        criticals[0]!.code,
        ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY
      )
      assert.match(criticals[0]!.message, /pikku addon sync/)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('PKU338 when the lock has no entry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-remote-sdk-'))
    try {
      const { logger, criticals } = makeLogger()
      validateRemoteAddonDependencies(logger, stateFor(rootDir, '^1.4.0'))
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /no entry/)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

describe('loadAddonFunctionsMeta (versioned wireRemoteAddon)', () => {
  test('reads the SDK meta into remoteAddonFunctions, never addonFunctions', async () => {
    const { rootDir } = makeProject()
    try {
      const state = stateFor(rootDir, '^1.4.0')
      await loadAddonFunctionsMeta(makeLogger().logger, state)
      assert.deepEqual(
        Object.keys(state.remoteAddonFunctions?.cloudapi ?? {}),
        ['getProject']
      )
      assert.deepEqual(state.addonFunctions, {})
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('loads nothing from an SDK that does not match the lock', async () => {
    const { rootDir } = makeProject({ marker: 'sha512-BBBB' })
    try {
      const state = stateFor(rootDir, '^1.4.0')
      await loadAddonFunctionsMeta(makeLogger().logger, state)
      assert.equal(state.remoteAddonFunctions, undefined)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

describe('findWireRemoteAddonSpecs', () => {
  test('finds each literal with its range and where it sits', () => {
    const source = `import { wireRemoteAddon } from '@pikku/core/addon'
wireRemoteAddon({
  name: 'cloudapi',
  package: '${NAME}@^1.4.0',
  serverUrl: 'https://api.example.com',
})
wireRemoteAddon({ name: 'legacy', package: "@pikkustudio/addon-registry", serverUrl: '' })
wireRemoteAddon({ name: 'dyn', package: PKG, serverUrl: '' })
`
    const specs = findWireRemoteAddonSpecs('wiring.ts', source)
    assert.equal(specs.length, 2)
    assert.equal(specs[0]!.namespace, 'cloudapi')
    assert.equal(specs[0]!.name, NAME)
    assert.equal(specs[0]!.range, '^1.4.0')
    assert.equal(specs[0]!.line, 4)
    assert.equal(
      source.slice(specs[0]!.start, specs[0]!.end),
      `'${NAME}@^1.4.0'`
    )
    assert.equal(specs[1]!.range, undefined)
  })
})
