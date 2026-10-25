import assert from 'node:assert'
import { describe, test } from 'node:test'
import { addFlagToSource, planAddMock, unknownRpcMessage } from './add.js'
import type { SurfaceView } from './diff.js'
import type { Mock } from './read.js'

const surface: SurfaceView = {
  functions: {
    'classes:month': {
      key: 'classes:month',
      version: 1,
      outputSchemaName: 'MonthOut',
      expose: true,
      readonly: true,
    },
    'classes:book': {
      key: 'classes:book',
      version: 1,
      outputSchemaName: 'BookOut',
      expose: true,
    },
  },
  schemas: {
    MonthOut: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    BookOut: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
    },
  },
}

const existing = (
  name: string,
  meta: Mock['meta'],
  data: unknown = []
): Mock => ({ name, hasData: true, data, meta, problems: [] })

const plan = (
  input: Partial<Parameters<typeof planAddMock>[0]>,
  mocks: Mock[] = [],
  rpc = 'classes:month'
) => planAddMock({ rpc, ...input }, surface, mocks, true)

describe('planAddMock', () => {
  test('the first mock is the default and gets the full meta', () => {
    const p = plan({ body: '[{"id":"a"}]' })
    assert.deepStrictEqual(p.meta, {
      label: 'Healthy',
      description: 'Typical data',
      state: 'healthy',
      default: true,
    })
    assert.strictEqual(p.name, 'healthy')
    assert.deepStrictEqual(p.data, [{ id: 'a' }])
    assert.deepStrictEqual(p.shape.invalid, [])
    assert.strictEqual(p.shape.checked, true)
  })

  test('a second mock is not the default, --default moves it', () => {
    const first = existing('healthy', { state: 'healthy', default: true })
    const second = plan({ state: 'empty' }, [first])
    assert.strictEqual(second.meta.default, undefined)
    assert.deepStrictEqual(second.clearDefault, [])
    const moved = plan({ state: 'empty', default: true }, [first])
    assert.strictEqual(moved.meta.default, true)
    assert.deepStrictEqual(moved.clearDefault, ['healthy'])
  })

  test('an empty mock of a list needs no body, an error mock gets status 500', () => {
    assert.deepStrictEqual(plan({ state: 'empty' }).data, [])
    const error = plan({ state: 'error' })
    assert.strictEqual(error.meta.status, 500)
    assert.strictEqual(plan({ state: 'error', status: 503 }).meta.status, 503)
    assert.deepStrictEqual(error.shape.invalid, [])
    assert.deepStrictEqual(error.shape.changes, [])
  })

  test('a healthy mock without a body is refused', () => {
    assert.throws(() => plan({}), /--body/)
    assert.throws(() => plan({ state: 'empty' }, [], 'classes:book'), /--body/)
  })

  test('an existing mock is only replaced with force', () => {
    const first = existing('healthy', { state: 'healthy', default: true })
    assert.throws(() => plan({ body: '[]' }, [first]), /--force/)
    const p = plan({ body: '[]', force: true }, [first])
    assert.strictEqual(p.replaces, true)
    assert.strictEqual(p.meta.default, true)
    assert.deepStrictEqual(p.clearDefault, [])
  })

  test('a body the function rejects is reported, not refused', () => {
    const p = plan({ body: '[{"id":1}]' })
    assert.ok(p.shape.invalid.length > 0)
  })

  test('bad input is named', () => {
    assert.throws(() => plan({ state: 'broken', body: '[]' }), /--state/)
    assert.throws(() => plan({ body: '{nope' }), /not valid JSON/)
    assert.throws(() => plan({ body: '[]', flag: 'no way' }), /camelCase/)
    assert.throws(() => plan({ body: '[]', data: { value: [] } }), /not both/)
    assert.throws(() => plan({ body: '[]', name: '../x' }), /file name/)
  })

  test('the hook follows the function kind', () => {
    assert.strictEqual(plan({ state: 'empty' }).hook, 'usePikkuQueryStub')
    assert.strictEqual(
      plan({ state: 'error' }, [], 'classes:book').hook,
      'usePikkuMutationStub'
    )
  })
})

describe('unknownRpcMessage', () => {
  test('names the available RPCs and the folder-style mistake', () => {
    const message = unknownRpcMessage(surface, 'classes.month')
    assert.match(message, /Did you mean classes:month/)
    assert.match(message, /classes:book, classes:month/)
  })
})

describe('addFlagToSource', () => {
  const file = `import { defineFeatureFlags } from '#pikku/scopes'

defineFeatureFlags({
  assistantPanel: {
    description: 'The assistant panel',
  },
})
`
  test('adds an entry before the closing brace', () => {
    assert.strictEqual(
      addFlagToSource(file, 'classMonth', 'Sample data for classes:month'),
      `import { defineFeatureFlags } from '#pikku/scopes'

defineFeatureFlags({
  assistantPanel: {
    description: 'The assistant panel',
  },
  classMonth: {
    description: 'Sample data for classes:month',
  },
})
`
    )
  })

  test('adds a missing trailing comma and ignores braces in strings', () => {
    const out = addFlagToSource(
      `defineFeatureFlags({\n  a: { description: 'x } y' }\n})\n`,
      'b',
      'B'
    )
    assert.ok(out?.includes("a: { description: 'x } y' },\n  b: {"))
  })

  test('gives up when there is no call to extend', () => {
    assert.strictEqual(addFlagToSource('export const x = 1\n', 'b', 'B'), null)
    assert.strictEqual(
      addFlagToSource('defineFeatureFlags({})\n', 'b', 'B'),
      null
    )
  })
})
