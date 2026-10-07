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
import { checkStubs, frontendRoots } from './stub-scan.js'
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

  const result = checkStubs(root, frontendRoots(root), ['reminders'])
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
      checkStubs(root, frontendRoots(root), ['reminders']).ok,
      true
    )
    rmSync(root, { recursive: true, force: true })
  })
})
