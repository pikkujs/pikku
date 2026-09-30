import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadSurface, readSurface, type FetchLike } from './surface.js'

let root: string
let pikkuDir: string

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value), 'utf-8')
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-surface-'))
  pikkuDir = join(root, '.pikku')

  writeJson(join(pikkuDir, 'function', 'pikku-functions-meta.gen.json'), {
    getUser: {
      pikkuFuncId: 'getUser',
      inputSchemaName: 'GetUserInput',
      outputSchemaName: 'GetUserOutput',
      contractHash: 'aaaa',
    },
    'getUser@v2': {
      pikkuFuncId: 'getUser@v2',
      inputSchemaName: 'GetUserV2Input',
      outputSchemaName: null,
    },
    someoneElsesFunction: { pikkuFuncId: 'someoneElsesFunction', remote: true },
  })

  writeJson(join(pikkuDir, 'http', 'pikku-http-wirings-meta.gen.json'), {
    get: { '/users/:id': { pikkuFuncId: 'getUser', route: '/users/:id' } },
  })

  const schemas = join(pikkuDir, 'schemas', 'schemas')
  mkdirSync(schemas, { recursive: true })
  writeJson(join(schemas, 'GetUserInput.schema.json'), {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  })
  writeJson(join(schemas, 'GetUserOutput.schema.json'), { type: 'object' })
  writeJson(join(schemas, 'GetUserV2Input.schema.json'), { type: 'object' })
  // Referenced by nothing — the snapshot should not carry it.
  writeJson(join(schemas, 'Unreferenced.schema.json'), { type: 'object' })

  writeJson(join(root, 'versions.pikku.json'), {
    manifestVersion: 1,
    contracts: {
      getUser: { latest: 2, versions: { '1': 'aaaa', '2': 'bbbb' } },
    },
  })
})

after(() => rmSync(root, { recursive: true, force: true }))

describe('readSurface', () => {
  test('splits functions from wirings and strips version suffixes into key/version', () => {
    const surface = readSurface(pikkuDir)
    assert.deepEqual(Object.keys(surface.functions).sort(), [
      'getUser',
      'getUser@v2',
    ])
    assert.equal(surface.functions['getUser'].key, 'getUser')
    assert.equal(surface.functions['getUser'].version, 1)
    assert.equal(surface.functions['getUser@v2'].key, 'getUser')
    assert.equal(surface.functions['getUser@v2'].version, 2)
    assert.deepEqual(Object.keys(surface.wirings), ['http'])
    assert.deepEqual(Object.keys(surface.wirings.http ?? {}), [
      'GET /users/:id',
    ])
  })

  test('a remote function belongs to another service, not this surface', () => {
    const surface = readSurface(pikkuDir)
    assert.equal(surface.functions['someoneElsesFunction'], undefined)
  })

  test('only schemas some function references travel with the snapshot', () => {
    const surface = readSurface(pikkuDir)
    assert.deepEqual(Object.keys(surface.schemas).sort(), [
      'GetUserInput',
      'GetUserOutput',
      'GetUserV2Input',
    ])
  })

  test('the manifest supplies the published versions', () => {
    const manifest = {
      manifestVersion: 1 as const,
      contracts: {
        getUser: { latest: 2, versions: { '1': 'aaaa', '2': 'bbbb' } },
      },
    }
    assert.deepEqual(readSurface(pikkuDir, manifest).publishedVersions, {
      getUser: [1, 2],
    })
    assert.deepEqual(readSurface(pikkuDir).publishedVersions, {})
  })
})

describe('loadSurface', () => {
  test('a directory is read as a .pikku tree, with the sibling manifest', async () => {
    const surface = await loadSurface(pikkuDir)
    assert.deepEqual(surface.publishedVersions, { getUser: [1, 2] })
    assert.ok(surface.functions['getUser'])
  })

  test('a file is read as a published snapshot', async () => {
    const snapshotPath = join(root, 'surface.json')
    writeJson(snapshotPath, readSurface(pikkuDir))
    const surface = await loadSurface(snapshotPath)
    assert.ok(surface.functions['getUser'])
    assert.ok(surface.schemas['GetUserInput'])
  })

  test('an http url is fetched as a published snapshot', async () => {
    const fetchImpl: FetchLike = async (url) => {
      assert.equal(url, 'https://api.acme.com/surface.json')
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(readSurface(pikkuDir)),
      }
    }
    const surface = await loadSurface(
      'https://api.acme.com/surface.json',
      fetchImpl
    )
    assert.ok(surface.functions['getUser'])
  })

  test('a failed fetch throws rather than comparing against nothing', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
    })
    await assert.rejects(
      () => loadSurface('https://api.acme.com/surface.json', fetchImpl),
      /404 Not Found/
    )
  })

  test('a json file that is not a snapshot is rejected by name', async () => {
    const path = join(root, 'not-a-surface.json')
    writeJson(path, { hello: 'world' })
    await assert.rejects(() => loadSurface(path), /not a surface snapshot/)
  })

  test('a snapshot from a newer Pikku is refused rather than misread', async () => {
    const path = join(root, 'future.json')
    writeJson(path, { schemaVersion: 99, functions: {} })
    await assert.rejects(() => loadSurface(path), /newer Pikku/)
  })

  test('a missing baseline is an error, not an empty comparison', async () => {
    await assert.rejects(
      () => loadSurface(join(root, 'nope')),
      /Baseline not found/
    )
  })
})

describe('readSurface — platform plumbing', () => {
  test('scaffold and generated sources are not part of the app surface', () => {
    const dir = join(root, 'platform', '.pikku')
    writeJson(join(dir, 'function', 'pikku-functions-meta.gen.json'), {
      getUser: { pikkuFuncId: 'getUser' },
      relayChangeRequest: { pikkuFuncId: 'relayChangeRequest' },
    })
    writeJson(join(dir, 'function', 'pikku-functions-meta-verbose.gen.json'), {
      getUser: { sourceFile: '/app/src/users.function.ts' },
      relayChangeRequest: {
        sourceFile: '/app/src/scaffold/fabric/changes/relay.function.ts',
      },
    })
    writeJson(join(dir, 'http', 'pikku-http-wirings-meta.gen.json'), {
      get: {
        '/users/:id': {
          pikkuFuncId: 'getUser',
          sourceFile: '/app/src/users.http.ts',
        },
        '/api/auth': {
          pikkuFuncId: 'auth',
          sourceFile: '/app/pikku/auth/auth.gen.ts',
        },
      },
      post: {
        '/changes': {
          pikkuFuncId: 'relayChangeRequest',
          sourceFile: '/app/src/scaffold/fabric/changes/changes.http.ts',
        },
      },
    })
    writeJson(join(dir, 'queue', 'pikku-queue-workers-wirings-meta.gen.json'), {
      audit: {
        pikkuFuncId: 'audit',
        sourceFile: '/app/src/scaffold/fabric/audit/audit.queue.ts',
      },
    })

    const surface = readSurface(dir)
    assert.deepEqual(Object.keys(surface.functions), ['getUser'])
    assert.deepEqual(Object.keys(surface.wirings), ['http'])
    assert.deepEqual(Object.keys(surface.wirings.http!), ['GET /users/:id'])
  })

  test('a wiring with no sourceFile is dropped when its function is platform', () => {
    const dir = join(root, 'platform-queue', '.pikku')
    writeJson(join(dir, 'function', 'pikku-functions-meta.gen.json'), {
      'queue:fabric-audit': { pikkuFuncId: 'queue:fabric-audit' },
      sendEmail: { pikkuFuncId: 'sendEmail' },
    })
    writeJson(join(dir, 'function', 'pikku-functions-meta-verbose.gen.json'), {
      'queue:fabric-audit': {
        sourceFile: '/app/src/scaffold/fabric/audit/fabric-audit.queue.ts',
      },
      sendEmail: { sourceFile: '/app/src/email.function.ts' },
    })
    writeJson(join(dir, 'queue', 'pikku-queue-workers-wirings-meta.gen.json'), {
      'fabric-audit': {
        pikkuFuncId: 'queue:fabric-audit',
        name: 'fabric-audit',
      },
      emails: { pikkuFuncId: 'sendEmail', name: 'emails' },
    })

    const surface = readSurface(dir)
    assert.deepEqual(Object.keys(surface.wirings.queue!), ['emails'])
  })
})
