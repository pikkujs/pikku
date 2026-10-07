import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  compareContracts,
  contractFromSchema,
  inferContract,
} from './contract.js'
import { diffMocks, type SurfaceView } from './diff.js'
import { readMocks } from './read.js'
import {
  callIndex,
  checkStubs,
  frontendRoots,
  scanFrontend,
} from './stub-scan.js'
import { validateAgainstSchema } from './validate.js'

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

const surface = (schema: unknown = listSchema): SurfaceView => ({
  functions: {
    'bookings:list': {
      key: 'bookings:list',
      version: 1,
      outputSchemaName: 'BookingsOut',
      expose: true,
    },
  },
  schemas: { BookingsOut: schema },
})

const mock = (name: string, data: unknown, meta?: object) => ({
  name,
  hasData: true,
  data,
  meta: meta as never,
  problems: [],
})

const healthy = mock(
  'busy',
  [
    { id: 'a', guests: 2, note: 'x' },
    { id: 'b', guests: 4 },
  ],
  {
    state: 'healthy',
    default: true,
  }
)
const empty = mock('empty', [], { state: 'empty' })
const error = mock('down', { message: 'boom' }, { state: 'error', status: 500 })

describe('inferContract', () => {
  test('a field some samples lack is optional', () => {
    const c = inferContract([{ a: 1, b: 'x' }, { a: 2 }])
    assert.strictEqual(c['$.a']!.optional, false)
    assert.strictEqual(c['$.b']!.optional, true)
  })
  test('an empty array adds no element shape', () => {
    const c = inferContract([[], [{ id: 1 }]])
    assert.deepStrictEqual(c['$[].id']!.kinds, ['number'])
  })
})

describe('validateAgainstSchema', () => {
  test('passes a matching value and names each problem otherwise', () => {
    assert.deepStrictEqual(validateAgainstSchema(healthy.data, listSchema), [])
    const errors = validateAgainstSchema([{ id: 1 }], listSchema)
    assert.ok(errors.some((e) => e.includes('$[0].id is number')))
    assert.ok(errors.some((e) => e.includes('$[0].guests is missing')))
  })
  test('follows $ref and anyOf', () => {
    const schema = {
      definitions: { Id: { type: 'string' } },
      anyOf: [{ type: 'null' }, { $ref: '#/definitions/Id' }],
    }
    assert.deepStrictEqual(validateAgainstSchema('a', schema), [])
    assert.deepStrictEqual(validateAgainstSchema(null, schema), [])
    assert.strictEqual(validateAgainstSchema(3, schema).length, 1)
  })
})

describe('compareContracts', () => {
  const fn = contractFromSchema(listSchema)
  test('matching shapes have no changes, optional fields may be absent', () => {
    assert.deepStrictEqual(
      compareContracts(inferContract([[{ id: 'a', guests: 1 }]]), fn),
      []
    )
  })
  test('reports added, removed and retyped fields', () => {
    const changes = compareContracts(
      inferContract([[{ id: 'a', guests: 'two', extra: true }]]),
      fn
    )
    const by = (kind: string) =>
      changes.filter((c) => c.kind === kind).map((c) => c.path)
    assert.deepStrictEqual(by('mock-only'), ['$[].extra'])
    assert.deepStrictEqual(by('retyped'), ['$[].guests'])
    const dropped = compareContracts(inferContract([[{ id: 'a' }]]), fn)
    assert.deepStrictEqual(
      dropped.map((c) => c.path),
      ['$[].guests']
    )
    assert.strictEqual(dropped[0]!.kind, 'function-only')
  })
  test('free-form objects accept any fields', () => {
    const open = contractFromSchema({ type: 'object' })
    assert.deepStrictEqual(
      compareContracts(inferContract([{ a: { b: 1 } }]), open),
      []
    )
  })
})

describe('diffMocks', () => {
  test('ok when mocks fit the function, warnings do not fail it', () => {
    const d = diffMocks(
      [{ rpc: 'bookings:list', mocks: [healthy, empty, error] }],
      surface()
    )
    assert.strictEqual(d.rpcs[0]!.status, 'ok')
    assert.strictEqual(d.ok, true)
  })
  test('added when no function exists', () => {
    const d = diffMocks([{ rpc: 'rooms:list', mocks: [healthy] }], surface())
    assert.strictEqual(d.rpcs[0]!.status, 'added')
    assert.strictEqual(d.ok, false)
  })
  test('changed when the mock gained a field, error mocks are ignored', () => {
    const grown = mock('busy', [{ id: 'a', guests: 2, room: 'r1' }], {
      default: true,
    })
    const d = diffMocks(
      [{ rpc: 'bookings:list', mocks: [grown, error] }],
      surface()
    )
    assert.strictEqual(d.rpcs[0]!.status, 'changed')
    assert.deepStrictEqual(
      d.rpcs[0]!.changes.map((c) => c.path),
      ['$[].room']
    )
  })
  test('a value that breaks the schema is reported', () => {
    const bad = mock('busy', [{ id: 1, guests: 2 }], { default: true })
    const d = diffMocks([{ rpc: 'bookings:list', mocks: [bad] }], surface())
    assert.strictEqual(d.rpcs[0]!.status, 'changed')
    assert.ok(d.rpcs[0]!.invalid.length > 0)
  })
  test('an unreadable mock makes the RPC invalid and adds no shape', () => {
    const good = mock('busy', [{ id: 'a', guests: 2 }], { default: true })
    const garbled = {
      name: 'garbled',
      hasData: false,
      problems: ['garbled.json is not valid JSON: Unexpected end'],
    }
    const d = diffMocks(
      [{ rpc: 'bookings:list', mocks: [good, garbled] }],
      surface()
    )
    assert.strictEqual(d.rpcs[0]!.status, 'invalid')
    assert.deepStrictEqual(d.rpcs[0]!.changes, [])
    assert.deepStrictEqual(d.rpcs[0]!.invalid, [])
    assert.strictEqual(d.ok, false)
  })
  test('warns on default problems and missing scenarios', () => {
    const two = [
      mock('a', [], { default: true, state: 'healthy' }),
      mock('b', [], { default: true, state: 'healthy' }),
    ]
    const w = diffMocks([{ rpc: 'bookings:list', mocks: two }], surface())
      .rpcs[0]!.warnings
    assert.ok(w.some((x) => x.startsWith('several mocks are marked default')))
    assert.ok(w.some((x) => x.includes('no error mock')))
    const none = diffMocks(
      [{ rpc: 'bookings:list', mocks: [mock('a', [])] }],
      surface()
    )
    assert.ok(
      none.rpcs[0]!.warnings.some((x) => x === 'no mock is marked default')
    )
    assert.ok(
      none.rpcs[0]!.warnings.some((x) => x.includes('has no a.meta.json'))
    )
  })
  test('--all lists functions without a mock', () => {
    const d = diffMocks([], surface(), { all: true })
    assert.deepStrictEqual(d.unmocked, ['bookings:list'])
  })
  test('--all skips functions the frontend cannot call', () => {
    const base = surface()
    const s: SurfaceView = {
      ...base,
      functions: {
        ...base.functions,
        hidden: { key: 'hidden', version: 1, outputSchemaName: null },
        scaffold: {
          key: 'scaffold',
          version: 1,
          outputSchemaName: null,
          expose: true,
          platform: true,
        },
      },
    }
    assert.deepStrictEqual(diffMocks([], s, { all: true }).unmocked, [
      'bookings:list',
    ])
  })
  test('a mock on a function that is not exposed warns', () => {
    const s: SurfaceView = {
      functions: {
        hidden: { key: 'hidden', version: 1, outputSchemaName: null },
      },
      schemas: {},
    }
    const d = diffMocks([{ rpc: 'hidden', mocks: [mock('ok', null)] }], s)
    assert.ok(d.rpcs[0]!.warnings.some((w) => w.includes('not exposed')))
  })
  test('a function that returns nothing expects a null mock', () => {
    const s: SurfaceView = {
      functions: {
        'x:y': {
          key: 'x:y',
          version: 1,
          outputSchemaName: null,
          expose: true,
        },
      },
      schemas: {},
    }
    assert.strictEqual(
      diffMocks([{ rpc: 'x:y', mocks: [mock('ok', null)] }], s).rpcs[0]!.status,
      'ok'
    )
    assert.notStrictEqual(
      diffMocks([{ rpc: 'x:y', mocks: [mock('ok', { a: 1 })] }], s).rpcs[0]!
        .status,
      'ok'
    )
  })
})

describe('readMocks', () => {
  test('maps directories to RPC names and reads meta, reporting bad files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mocks-'))
    try {
      const dir = join(root, '.mocks', 'bookings.list')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'busy.json'), '[1]')
      writeFileSync(
        join(dir, 'busy.meta.json'),
        '{"state":"healthy","default":true,"delayMs":"x"}'
      )
      writeFileSync(join(dir, 'broken.json'), '{')
      writeFileSync(join(dir, 'orphan.meta.json'), '{}')
      const [rpc] = await readMocks(root)
      assert.strictEqual(rpc!.rpc, 'bookings:list')
      const byName = Object.fromEntries(rpc!.mocks.map((m) => [m.name, m]))
      assert.deepStrictEqual(byName.busy!.data, [1])
      assert.strictEqual(byName.busy!.meta!.default, true)
      assert.ok(byName.busy!.problems.some((p) => p.includes('delayMs')))
      assert.ok(byName.broken!.problems[0]!.includes('not valid JSON'))
      assert.strictEqual(byName.broken!.hasData, false)
      assert.ok(byName.orphan!.problems[0]!.includes('has no orphan.json'))
      assert.deepStrictEqual(await readMocks(join(root, 'nothing')), [])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('stub scan', () => {
  const root = mkdtempSync(join(tmpdir(), 'stubscan-'))
  const write = (rel: string, text: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  write(
    'apps/app/src/ok.tsx',
    `import { usePikkuQueryStub } from 'sdk'
usePikkuQueryStub('reminders:list', { featureFlag: 'reminders' })`
  )
  write(
    'apps/app/src/unflagged.tsx',
    `import { usePikkuQueryStub as stubbed, usePikkuMutationStub } from 'sdk'
stubbed('reminders:list')
usePikkuMutationStub('reminders:send', { input: { a: 1 } })`
  )
  write(
    'apps/app/src/undeclared.tsx',
    `api.usePikkuQueryStub('reminders:list', { featureFlag: 'ghost' })`
  )
  write(
    'apps/app/src/dynamic.tsx',
    `const f = 'x'
usePikkuQueryStub('a:b', { featureFlag: f })`
  )
  write(
    'apps/app/src/plain.tsx',
    `usePikkuQuery('bookings:list', {})
usePikkuMutation('bookings:create')
const usePikkuQueryStubby = 1`
  )
  write('apps/app/src/skipped.gen.ts', `usePikkuQueryStub('x:y')`)

  const result = checkStubs(scanFrontend(root, frontendRoots(root)), [
    'reminders',
  ])
  const at = (file: string) => result.calls.filter((c) => c.file.endsWith(file))

  test('a flagged stub with a declared flag passes', () => {
    assert.deepStrictEqual(
      at('ok.tsx').map((c) => [c.flag, c.problem]),
      [['reminders', undefined]]
    )
  })

  test('an unflagged stub is blocked, through an alias and with only input', () => {
    assert.deepStrictEqual(
      at('unflagged.tsx').map((c) => [c.line, c.problem]),
      [
        [2, 'no-flag'],
        [3, 'no-flag'],
      ]
    )
  })

  test('an undeclared flag is blocked, through a property access', () => {
    assert.deepStrictEqual(
      at('undeclared.tsx').map((c) => [c.flag, c.problem]),
      [['ghost', 'undeclared-flag']]
    )
  })

  test('a flag that is not a literal is blocked', () => {
    assert.strictEqual(at('dynamic.tsx')[0].problem, 'flag-not-literal')
  })

  test('plain hooks, lookalikes and generated files are ignored', () => {
    assert.strictEqual(at('plain.tsx').length, 0)
    assert.strictEqual(at('skipped.gen.ts').length, 0)
  })

  test('the check fails when any stub is blocked and passes when none is', () => {
    assert.strictEqual(result.ok, false)
    rmSync(join(root, 'apps/app/src/unflagged.tsx'))
    rmSync(join(root, 'apps/app/src/undeclared.tsx'))
    rmSync(join(root, 'apps/app/src/dynamic.tsx'))
    assert.strictEqual(
      checkStubs(scanFrontend(root, frontendRoots(root)), ['reminders']).ok,
      true
    )
    rmSync(root, { recursive: true, force: true })
  })
})

describe('stub fit', () => {
  const root = mkdtempSync(join(tmpdir(), 'stubfit-'))
  mkdirSync(join(root, 'apps/app/src'), { recursive: true })
  writeFileSync(
    join(root, 'apps/app/src/screen.tsx'),
    `usePikkuQueryStub('bookings:list', { featureFlag: 'rooms' })
usePikkuQueryStub('guests:list', { featureFlag: 'rooms' })
usePikkuQueryStub('rooms:list', { featureFlag: 'rooms' })`
  )
  const grown = mock('busy', [{ id: 'a', guests: 2, room: 'r1' }], {
    default: true,
  })
  const statuses = new Map(
    diffMocks(
      [
        { rpc: 'bookings:list', mocks: [healthy] },
        { rpc: 'guests:list', mocks: [grown] },
        { rpc: 'rooms:list', mocks: [healthy] },
      ],
      {
        functions: {
          ...surface().functions,
          'guests:list': {
            key: 'guests:list',
            version: 1,
            outputSchemaName: 'BookingsOut',
            expose: true,
          },
        },
        schemas: surface().schemas,
      }
    ).rpcs.map((r) => [r.rpc, r.status] as const)
  )
  const result = checkStubs(
    scanFrontend(root, frontendRoots(root)),
    ['rooms'],
    { status: (rpc) => statuses.get(rpc) }
  )
  const problem = (rpc: string) =>
    result.calls.find((c) => c.rpc === rpc)!.problem

  test('a stub on a function the mock already fits is blocked', () => {
    assert.strictEqual(problem('bookings:list'), 'backend-supports')
    assert.strictEqual(result.ok, false)
  })

  test('a stub on a function whose shape the mock changes is allowed', () => {
    assert.strictEqual(problem('guests:list'), undefined)
  })

  test('a stub on an RPC with no function is allowed', () => {
    assert.strictEqual(problem('rooms:list'), undefined)
    rmSync(root, { recursive: true, force: true })
  })
})

const fixture = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'stubcases-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return { root, scan: scanFrontend(root, frontendRoots(root)) }
}

const withFunctions = (...keys: string[]): SurfaceView => ({
  functions: {
    ...surface().functions,
    ...Object.fromEntries(
      keys.map((key) => [
        key,
        { key, version: 1, outputSchemaName: 'BookingsOut', expose: true },
      ])
    ),
  },
  schemas: surface().schemas,
})

describe('stub cases', () => {
  const { root, scan } = fixture({
    'apps/app/src/screen.tsx': `usePikkuQueryStub('guests:list', { featureFlag: 'rooms' })
usePikkuQueryStub('seats:list')
usePikkuQueryStub('tables:list', { featureFlag: 'rooms' })
usePikkuQueryStub('rooms:list', { featureFlag: 'rooms' })
usePikkuQueryStub('ghost:list', { featureFlag: 'rooms' })
usePikkuQuery('bookings:list')
usePikkuQuery('orphans:list')
usePikkuMutation('bookings:create')`,
  })
  const grown = mock('busy', [{ id: 'a', guests: 2, room: 'r1' }], {
    default: true,
  })
  const good = mock('busy', [{ id: 'a', guests: 2 }], { default: true })
  const garbled = {
    name: 'garbled',
    hasData: false,
    problems: ['garbled.json is not valid JSON: Unexpected end'],
  }
  const surfaceView = withFunctions('guests:list', 'seats:list', 'tables:list')
  const rpcMocks = [
    { rpc: 'guests:list', mocks: [grown] },
    { rpc: 'seats:list', mocks: [grown] },
    { rpc: 'tables:list', mocks: [good, garbled] },
    { rpc: 'rooms:list', mocks: [healthy] },
  ]
  const diff = diffMocks(rpcMocks, surfaceView, { calls: callIndex(scan) })
  const status = new Map(diff.rpcs.map((r) => [r.rpc, r.status]))
  const keys = new Set(Object.values(surfaceView.functions).map((f) => f.key))
  const result = checkStubs(scan, ['rooms', 'spare'], {
    hasFunction: (rpc) => keys.has(rpc),
    status: (rpc) => status.get(rpc),
    mocked: new Set(rpcMocks.map((m) => m.rpc)),
    dead: diff.rpcs.filter((r) => r.status === 'removed').map((r) => r.rpc),
    unused: diff.rpcs.filter((r) => r.unused).map((r) => r.rpc),
  })
  const problem = (rpc: string) =>
    result.calls.find((c) => c.rpc === rpc)!.problem

  test('a stub on a changed function with a flag can be published (case 10)', () => {
    assert.strictEqual(status.get('guests:list'), 'changed')
    assert.strictEqual(problem('guests:list'), undefined)
  })

  test('a stub on a changed function with no flag is blocked (case 11)', () => {
    assert.strictEqual(problem('seats:list'), 'no-flag')
  })

  test('a stub on a function whose mock is invalid is blocked (case 13)', () => {
    assert.strictEqual(status.get('tables:list'), 'invalid')
    assert.strictEqual(problem('tables:list'), 'mock-invalid')
  })

  test('a stub on an RPC with no function is allowed (case 6)', () => {
    assert.strictEqual(problem('rooms:list'), undefined)
  })

  test('a stub with no mock directory is blocked (case 14)', () => {
    assert.strictEqual(problem('ghost:list'), 'no-mock')
  })

  test('a plain call with no function and no stub is an error (case 5)', () => {
    assert.deepStrictEqual(
      result.missing.map((c) => c.rpc),
      ['orphans:list', 'bookings:create']
    )
    assert.strictEqual(result.ok, false)
  })

  test('a declared flag no stub uses is reported, never failed', () => {
    assert.deepStrictEqual(result.orphanFlags, ['spare'])
  })

  test('only error mocks warn that no healthy mock exists (case 15)', () => {
    const only = diffMocks(
      [{ rpc: 'bookings:list', mocks: [error] }],
      surface()
    ).rpcs[0]!
    assert.ok(only.warnings.some((w) => w.includes('only error mocks')))
    rmSync(root, { recursive: true, force: true })
  })
})

describe('unused and dead mocks', () => {
  const { root, scan } = fixture({
    'apps/app/src/screen.tsx': `usePikkuQuery('bookings:list')
usePikkuQueryStub('rooms:list', { featureFlag: 'rooms' })`,
  })
  const calls = callIndex(scan)
  const rpcMocks = [
    { rpc: 'bookings:list', mocks: [healthy, empty, error] },
    { rpc: 'rooms:list', mocks: [healthy] },
    { rpc: 'old:list', mocks: [healthy] },
    { rpc: 'guests:list', mocks: [healthy] },
  ]
  const diff = diffMocks(rpcMocks, withFunctions('guests:list'), { calls })
  const report = (rpc: string) => diff.rpcs.find((r) => r.rpc === rpc)!

  test('a mock with no function and no call is removed, and does not fail diff', () => {
    assert.strictEqual(report('old:list').status, 'removed')
    assert.ok(
      report('old:list').warnings.some(
        (w) => w === 'unused, delete .mocks/old.list'
      )
    )
  })

  test('a mock with no function and a stub call stays added', () => {
    assert.strictEqual(report('rooms:list').status, 'added')
  })

  test('a mock on a function nothing calls is unused, status unchanged', () => {
    assert.strictEqual(report('guests:list').unused, true)
    assert.strictEqual(report('guests:list').status, 'ok')
    assert.strictEqual(report('bookings:list').unused, undefined)
  })

  test('removed alone does not fail diff, but added still does', () => {
    const only = diffMocks([{ rpc: 'old:list', mocks: [healthy] }], surface(), {
      calls,
    })
    assert.strictEqual(only.ok, true)
    assert.strictEqual(diff.ok, false)
  })

  test('a call whose name is not a literal means nothing is reported unused', () => {
    const dynamic = fixture({
      'apps/app/src/screen.tsx': `const name = 'x'
usePikkuQuery(name)`,
    })
    const index = callIndex(dynamic.scan)
    assert.strictEqual(index.unresolved, 1)
    const d = diffMocks(rpcMocks, withFunctions('guests:list'), {
      calls: index,
    })
    assert.strictEqual(
      d.rpcs.find((r) => r.rpc === 'old:list')!.status,
      'added'
    )
    assert.strictEqual(
      d.rpcs.find((r) => r.rpc === 'guests:list')!.unused,
      undefined
    )
    assert.strictEqual(d.unresolved, 1)
    rmSync(dynamic.root, { recursive: true, force: true })
  })

  test('check passes with dead and unused mocks, and --strict fails on them', () => {
    const facts = {
      hasFunction: (rpc: string) => rpc !== 'rooms:list' && rpc !== 'old:list',
      dead: ['old:list'],
      unused: ['guests:list'],
    }
    const plain = checkStubs(scan, ['rooms'], facts)
    assert.strictEqual(plain.ok, true)
    const strict = checkStubs(scan, ['rooms'], facts, { strict: true })
    assert.strictEqual(strict.ok, false)
    rmSync(root, { recursive: true, force: true })
  })
})
