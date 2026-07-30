import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  RESOURCE_PREFIXES,
  collectKnownResources,
  parseResourceUri,
} from './resource-uri.js'

/** A project on disk: `{ 'relative/path.json': <json or string> }`. */
const project = async (files: Record<string, unknown>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-resource-'))
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(
      full,
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf8'
    )
  }
  return root
}

const known = (root: string) =>
  collectKnownResources(root, join(root, '.pikku'))

describe('parseResourceUri', () => {
  test('splits a known prefix from its id', () => {
    assert.deepEqual(parseResourceUri('func:createEntry'), {
      prefix: 'func',
      id: 'createEntry',
    })
  })

  test('keeps colons inside the id, which http routes carry', () => {
    assert.deepEqual(parseResourceUri('http:get:/api/entries'), {
      prefix: 'http',
      id: 'get:/api/entries',
    })
  })

  test('rejects an unknown prefix rather than inventing a kind', () => {
    assert.equal(parseResourceUri('service:kysely'), null)
  })

  test('rejects a missing prefix, a missing id, and a leading colon', () => {
    assert.equal(parseResourceUri('createEntry'), null)
    assert.equal(parseResourceUri('func:'), null)
    assert.equal(parseResourceUri('func:   '), null)
    assert.equal(parseResourceUri(':createEntry'), null)
  })

  test('trims the id', () => {
    assert.equal(parseResourceUri('func: createEntry ')?.id, 'createEntry')
  })

  test('every prefix in the scheme is resolvable by collectKnownResources', async () => {
    // The design rule of the scheme: a prefix that cannot be checked is worse
    // than no prefix, because notes then accumulate references nothing validates.
    // Adding a prefix without teaching the collector to resolve it breaks that,
    // silently — nothing else fails.
    const root = await project({
      '.pikku/function/pikku-functions-meta.gen.json': { f: {} },
      '.pikku/workflow/meta/w.gen.json': {},
      '.pikku/schemas/schemas/S.schema.json': {},
      '.pikku/http/pikku-http-wirings-meta.gen.json': { get: { '/r': {} } },
      '.pikku/queue/pikku-queue-workers-wirings-meta.gen.json': { q: {} },
      '.pikku/scheduler/pikku-schedulers-wirings-meta.gen.json': { c: {} },
      '.pikku/channel/pikku-channels-meta.gen.json': { ch: {} },
      '.pikku/db/pikku-db-schema.gen.json': { tables: [{ name: 't' }] },
      'package.json': { dependencies: { '@pikku/addon-stripe': '1' } },
      'pikku.config.json': { scenarios: { personas: { owner: {} } } },
    })
    assert.deepEqual(
      [...(await known(root)).keys()].sort(),
      [...RESOURCE_PREFIXES].sort()
    )
  })
})

describe('collectKnownResources', () => {
  test('takes func ids from the function meta keys', async () => {
    const root = await project({
      '.pikku/function/pikku-functions-meta.gen.json': {
        createEntry: { pikkuFuncId: 'createEntry' },
        'channel:chat:connect': {},
      },
    })
    assert.deepEqual([...(await known(root)).get('func')!].sort(), [
      'channel:chat:connect',
      'createEntry',
    ])
  })

  test('takes workflow ids from the meta filenames, ignoring the verbose twins', async () => {
    const root = await project({
      '.pikku/workflow/meta/autoRestock.gen.json': {},
      '.pikku/workflow/meta/autoRestock-verbose.gen.json': {},
    })
    assert.deepEqual([...(await known(root)).get('workflow')!], ['autoRestock'])
  })

  test('takes schema ids from the schema filenames', async () => {
    const root = await project({
      '.pikku/schemas/schemas/CreateEntryInput.schema.json': {},
      '.pikku/schemas/schemas/index.ts': 'export {}',
    })
    assert.deepEqual(
      [...(await known(root)).get('schema')!],
      ['CreateEntryInput']
    )
  })

  test('resolves an http note by route, by method:route, or by its function', async () => {
    // A note author picks whichever of the three reads naturally; all three name
    // the same wiring, so making them learn which one pikku calls the id would
    // only produce false danglings.
    const root = await project({
      '.pikku/http/pikku-http-wirings-meta.gen.json': {
        get: { '/api/entries': { pikkuFuncId: 'listEntries' } },
      },
    })
    const http = (await known(root)).get('http')!
    assert.ok(http.has('/api/entries'))
    assert.ok(http.has('get:/api/entries'))
    assert.ok(http.has('listEntries'))
  })

  test('ignores the contracts meta sitting beside the wirings meta', async () => {
    // It is keyed by type name, so reading it would resolve ids no note means.
    const root = await project({
      '.pikku/http/pikku-http-wirings-meta.gen.json': {
        get: { '/real': { pikkuFuncId: 'realFunc' } },
      },
      '.pikku/http/pikku-http-contracts-meta.gen.json': {
        SomeContractType: { '/fake': {} },
      },
    })
    const http = (await known(root)).get('http')!
    assert.ok(http.has('/real'))
    assert.ok(!http.has('SomeContractType'))
  })

  test('resolves queue, cron and channel by wiring name', async () => {
    const root = await project({
      '.pikku/queue/pikku-queue-workers-wirings-meta.gen.json': {
        'test-queue': { name: 'test-queue', pikkuFuncId: 'work' },
      },
      '.pikku/scheduler/pikku-schedulers-wirings-meta.gen.json': {
        nightly: { name: 'nightly', schedule: '0 0 * * *' },
      },
      '.pikku/channel/pikku-channels-meta.gen.json': {
        chat: { name: 'chat', route: '/chat' },
      },
    })
    const resources = await known(root)
    assert.ok(resources.get('queue')!.has('test-queue'))
    assert.ok(resources.get('queue')!.has('work'))
    assert.ok(resources.get('cron')!.has('nightly'))
    assert.ok(resources.get('channel')!.has('chat'))
  })

  test('takes table names from the generated db schema', async () => {
    const root = await project({
      '.pikku/db/pikku-db-schema.gen.json': {
        tables: [{ name: 'entry' }, { name: 'day' }],
        enums: {},
      },
    })
    assert.deepEqual([...(await known(root)).get('table')!], ['entry', 'day'])
  })

  test('resolves an addon by package name or bare name', async () => {
    const root = await project({
      'package.json': {
        dependencies: { '@pikku/addon-stripe': '1', kysely: '1' },
      },
      'packages/functions/package.json': {
        devDependencies: { '@pikku/addon-graph': '1' },
      },
    })
    const addons = (await known(root)).get('addon')!
    assert.ok(addons.has('@pikku/addon-stripe'))
    assert.ok(addons.has('stripe'))
    assert.ok(addons.has('graph'))
    assert.ok(!addons.has('kysely'))
  })

  test('takes personas from the config, the one prefix with no codegen behind it', async () => {
    const root = await project({
      'pikku.config.json': {
        scenarios: { personas: { owner: {}, guest: {} } },
      },
    })
    assert.deepEqual(
      [...(await known(root)).get('persona')!],
      ['owner', 'guest']
    )
  })

  test('leaves a prefix absent when its meta is missing, never empty', async () => {
    // An empty set would read as "nothing resolves", failing every note that
    // mentions a queue in a project that simply has no queues. Absent means the
    // caller skips the prefix instead.
    const root = await project({
      '.pikku/function/pikku-functions-meta.gen.json': { f: {} },
    })
    const resources = await known(root)
    assert.deepEqual([...resources.keys()], ['func'])
    for (const prefix of RESOURCE_PREFIXES) {
      assert.notEqual(resources.get(prefix)?.size, 0)
    }
  })

  test('a project with no codegen at all resolves nothing and does not throw', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-resource-'))
    assert.equal((await known(root)).size, 0)
  })

  test('survives malformed json rather than aborting the whole check', async () => {
    const root = await project({
      '.pikku/function/pikku-functions-meta.gen.json': '{ not json',
      '.pikku/db/pikku-db-schema.gen.json': { tables: [{ name: 'entry' }] },
    })
    const resources = await known(root)
    assert.equal(resources.has('func'), false)
    assert.ok(resources.get('table')!.has('entry'))
  })
})
