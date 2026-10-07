import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { diffMocks, type SurfaceView } from './diff.js'
import { LOCK_FILE, readLock, type MocksLock } from './lock.js'
import type { Mock, RpcMocks } from './read.js'
import { planSync } from './sync.js'

const listSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      guests: { type: 'integer' },
      note: { type: 'string' },
    },
    required: ['id', 'guests'],
  },
}

const surfaceOf = (schema: unknown = listSchema): SurfaceView => ({
  functions: {
    'bookings:list': {
      key: 'bookings:list',
      version: 1,
      outputSchemaName: 'BookingsOut',
      expose: true,
    },
    'cooks:list': {
      key: 'cooks:list',
      version: 1,
      outputSchemaName: 'CooksOut',
      expose: true,
    },
  },
  schemas: {
    BookingsOut: schema,
    CooksOut: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
})

const mock = (name: string, data: unknown, meta?: object): Mock => ({
  name,
  hasData: true,
  data,
  meta: meta as never,
  problems: [],
})

const bookings = (rows: unknown[] = [{ id: 'a', guests: 2 }]): RpcMocks => ({
  rpc: 'bookings:list',
  mocks: [
    mock('busy', rows, { state: 'healthy', default: true }),
    mock('empty', [], { state: 'empty' }),
  ],
})

const cooks: RpcMocks = {
  rpc: 'cooks:list',
  mocks: [mock('all', [{ name: 'Ada' }], { state: 'healthy', default: true })],
}

const synced = (rpcMocks: RpcMocks[], surface = surfaceOf()): MocksLock =>
  planSync(rpcMocks, surface, null).lock

describe('planSync', () => {
  test('the lock text is deterministic: sorted keys, stable order, one trailing newline', () => {
    const a = planSync([bookings(), cooks], surfaceOf(), null)
    const b = planSync([cooks, bookings()], surfaceOf(), null)
    assert.strictEqual(a.text, b.text)
    assert.ok(a.text.endsWith('}\n') && !a.text.endsWith('\n\n'))
    assert.deepStrictEqual(Object.keys(a.lock.rpcs), [
      'bookings:list',
      'cooks:list',
    ])
    const paths = Object.keys(a.lock.rpcs['bookings:list']!.mock)
    assert.deepStrictEqual(paths, [...paths].sort())
    assert.deepStrictEqual(JSON.parse(a.text), a.lock)
  })

  test('records the function contract when one exists, and not when it does not', () => {
    const plan = planSync(
      [
        bookings(),
        { rpc: 'new:thing', mocks: [mock('ok', { a: 1 }, { default: true })] },
      ],
      surfaceOf(),
      null
    )
    assert.ok(plan.lock.rpcs['bookings:list']!.function)
    assert.strictEqual(plan.lock.rpcs['new:thing']!.function, undefined)
  })

  test('summarises what changed against the lock on disk', () => {
    const before = synced([bookings(), cooks])
    const plan = planSync(
      [
        bookings([{ id: 'a', guests: 2, note: 'x' }]),
        { rpc: 'new:thing', mocks: [mock('ok', { a: 1 }, { default: true })] },
      ],
      surfaceOf(),
      before
    )
    assert.deepStrictEqual(plan.added, ['new:thing'])
    assert.deepStrictEqual(
      plan.updated.map((u) => u.rpc),
      ['bookings:list']
    )
    assert.deepStrictEqual(plan.removed, ['cooks:list'])
    assert.strictEqual(plan.unchanged, 0)
    const same = planSync([bookings(), cooks], surfaceOf(), before)
    assert.strictEqual(same.unchanged, 2)
    assert.strictEqual(
      same.text,
      planSync([bookings(), cooks], surfaceOf(), null).text
    )
  })

  test('refuses while any RPC is invalid', () => {
    const broken: RpcMocks = {
      rpc: 'bookings:list',
      mocks: [
        {
          name: 'garbled',
          hasData: false,
          problems: ['garbled.json is not valid JSON: Unexpected end'],
        },
      ],
    }
    const plan = planSync([broken, cooks], surfaceOf(), null)
    assert.strictEqual(plan.ok, false)
    assert.deepStrictEqual(
      plan.refused.map((r) => r.rpc),
      ['bookings:list']
    )
    assert.ok(plan.refused[0]!.problems[0]!.includes('not valid JSON'))
  })

  test('refuses a mock the function rejects', () => {
    const wrong = bookings([{ id: 1, guests: 'two' }])
    assert.strictEqual(planSync([wrong], surfaceOf(), null).ok, false)
  })
})

describe('drift against the lock', () => {
  test('a mock edited after the sync is changed even though the function still fits', () => {
    const lock = synced([bookings(), cooks])
    const edited = bookings([
      { id: 'a', guests: 2 },
      { id: 'b', guests: 1, note: 'x' },
    ])
    const report = diffMocks([edited, cooks], surfaceOf(), { lock }).rpcs.find(
      (r) => r.rpc === 'bookings:list'
    )!
    assert.strictEqual(report.changes.length, 0)
    assert.strictEqual(report.status, 'changed')
    assert.deepStrictEqual(
      report.drift.map((d) => [d.path, d.kind]),
      [['$[].note', 'added']]
    )
  })

  test('a mock that still matches the lock stays ok', () => {
    const lock = synced([bookings(), cooks])
    const diff = diffMocks([bookings(), cooks], surfaceOf(), { lock })
    assert.strictEqual(diff.lock, 'present')
    assert.ok(diff.rpcs.every((r) => r.status === 'ok'))
    assert.strictEqual(diff.ok, true)
  })

  test('a mock directory the lock has never seen is changed until sync', () => {
    const lock = synced([bookings()])
    const report = diffMocks([bookings(), cooks], surfaceOf(), {
      lock,
    }).rpcs.find((r) => r.rpc === 'cooks:list')!
    assert.strictEqual(report.unsynced, true)
    assert.strictEqual(report.status, 'changed')
  })

  test('a lock entry with no mocks is reported as removed from the lock and does not fail', () => {
    const lock = synced([bookings(), cooks])
    const diff = diffMocks([bookings()], surfaceOf(), { lock })
    assert.deepStrictEqual(diff.lockOnly, ['cooks:list'])
    assert.strictEqual(diff.ok, true)
  })

  test('a missing lock is a note, not a failure', () => {
    const diff = diffMocks([bookings()], surfaceOf(), { lock: null })
    assert.strictEqual(diff.lock, 'missing')
    assert.strictEqual(diff.ok, true)
    assert.strictEqual(diff.rpcs[0]!.status, 'ok')
  })

  test('without a lock option nothing is compared', () => {
    const diff = diffMocks([bookings()], surfaceOf())
    assert.strictEqual(diff.lock, undefined)
    assert.deepStrictEqual(diff.lockOnly, [])
  })

  test('a function that changed since the sync only warns while the mock still fits', () => {
    const lock = synced([bookings()])
    const widened = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          guests: { type: 'integer' },
          room: { type: 'string' },
        },
        required: ['id', 'guests'],
      },
    }
    const report = diffMocks([bookings()], surfaceOf(widened), { lock })
      .rpcs[0]!
    assert.strictEqual(report.status, 'ok')
    assert.ok(report.warnings.some((w) => w.includes('function')))
  })

  test('a function removed since the sync is added again, with a note', () => {
    const lock = synced([bookings()])
    const gone: SurfaceView = { functions: {}, schemas: {} }
    const report = diffMocks([bookings()], gone, { lock }).rpcs[0]!
    assert.strictEqual(report.status, 'added')
    assert.ok(report.warnings.some((w) => w.includes('removed since')))
  })
})

describe('readLock', () => {
  const withRoot = async (fn: (root: string) => Promise<void>) => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-lock-'))
    try {
      mkdirSync(join(root, '.mocks'))
      await fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test('null when absent, the lock when present, a clear error when broken', async () => {
    await withRoot(async (root) => {
      assert.strictEqual(await readLock(root), null)
      const lock = synced([bookings()])
      writeFileSync(join(root, '.mocks', LOCK_FILE), JSON.stringify(lock))
      assert.deepStrictEqual(await readLock(root), lock)
      writeFileSync(join(root, '.mocks', LOCK_FILE), '{ nope')
      await assert.rejects(() => readLock(root), /not valid JSON/)
      writeFileSync(join(root, '.mocks', LOCK_FILE), '{"version":9,"rpcs":{}}')
      await assert.rejects(() => readLock(root), /version 1/)
    })
  })
})
