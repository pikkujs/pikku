import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addonFunctionDetail,
  addonFunctionRows,
  addonSummary,
  describeSchema,
  graphChecks,
  similarAddonFunctions,
  wiredAddons,
} from './meta-addons.js'

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-meta-addons-'))
  const pkg = join(root, 'node_modules/@pikku/addon-slack')
  mkdirSync(join(pkg, 'dist/.pikku/addon/function'), { recursive: true })
  mkdirSync(join(pkg, 'dist/.pikku/addon/schemas/schemas'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), '{"name":"@pikku/addon-slack"}')
  writeFileSync(
    join(pkg, 'dist/.pikku/addon/function/pikku-functions-meta.gen.json'),
    JSON.stringify({
      chatPostMessage: {
        inputSchemaName: 'ChatPostMessageInput',
        outputSchemaName: 'ChatPostMessageOutput',
        description: 'Posts a message',
      },
      searchMessages: { inputSchemaName: 'SearchMessagesInput' },
    })
  )
  writeFileSync(
    join(
      pkg,
      'dist/.pikku/addon/schemas/schemas/ChatPostMessageInput.schema.json'
    ),
    JSON.stringify({
      type: 'object',
      required: ['channel'],
      properties: {
        channel: { type: 'string', description: 'Where to post' },
        text: { type: 'string' },
      },
    })
  )
  mkdirSync(join(root, 'packages/functions'), { recursive: true })
  const state = {
    rpc: {
      wireAddonDeclarations: new Map([
        ['slack', { package: '@pikku/addon-slack' }],
      ]),
    },
  }
  return { config: { rootDir: join(root, 'packages/functions') }, state }
}

describe('meta addons', () => {
  test('wired addons come from the declarations, Map or object', () => {
    assert.deepEqual(
      wiredAddons({
        rpc: {
          wireAddonDeclarations: { slack: { package: '@pikku/addon-slack' } },
        },
      }),
      [{ namespace: 'slack', packageName: '@pikku/addon-slack' }]
    )
    assert.deepEqual(wiredAddons({}), [])
  })
  test('rows are <namespace>:<function> with the words of the id so a search finds them', () => {
    const { config, state } = project()
    const rows = addonFunctionRows(config, state)
    assert.deepEqual(
      rows.map((r) => r.name),
      ['slack:chatPostMessage', 'slack:searchMessages']
    )
    assert.ok(rows[0]!.detail!.includes('chat post message'))
  })
  test('detail gives required/optional input fields and the call shape', () => {
    const { config, state } = project()
    const d = addonFunctionDetail(config, state, 'slack:chatPostMessage')!
    assert.equal(d.input.name, 'ChatPostMessageInput')
    assert.deepEqual(d.input.fields, [
      'channel: string — Where to post',
      'text?: string',
    ])
    assert.ok(d.call.includes("'slack:chatPostMessage'"))
  })
  test('an unknown function or namespace has no detail; similar ones are suggested from the function part only', () => {
    const { config, state } = project()
    assert.equal(addonFunctionDetail(config, state, 'slack:nope'), undefined)
    assert.equal(addonFunctionDetail(config, state, 'other:x'), undefined)
    assert.deepEqual(
      similarAddonFunctions(config, state, 'slack:postMessage'),
      ['slack:chatPostMessage', 'slack:searchMessages']
    )
  })
  test('enums and arrays say what they hold; a function with no input says so', () => {
    assert.deepEqual(
      describeSchema({
        properties: {
          base: { type: 'string', enum: ['EUR', 'USD'] },
          ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['base'],
      }),
      ['base: "EUR"|"USD"', 'ids?: array<string>']
    )
    const { config, state } = project()
    const d = addonFunctionDetail(config, state, 'slack:searchMessages')!
    assert.equal(d.input.note, undefined)
  })
  test('summary counts functions per addon; describeSchema caps long field lists', () => {
    const { config, state } = project()
    assert.deepEqual(addonSummary(config, state), [
      { namespace: 'slack', package: '@pikku/addon-slack', functions: 2 },
    ])
    const big = {
      properties: Object.fromEntries(
        Array.from({ length: 70 }, (_, i) => [`f${i}`, { type: 'string' }])
      ),
    }
    assert.equal(describeSchema(big).at(-1), '… 10 more fields')
  })
})

describe('graphChecks', () => {
  const graph = {
    nodes: {
      send: {
        rpcName: 'gmail:messageSend',
        input: { subject: 'Hi', body: 'x' },
      },
      whole: { rpcName: 'gmail:messageSend', input: { $ref: 'send' } },
      list: { rpcName: 'gmail:messageList', input: {} },
      deal: { rpcName: 'pipedrive__createDeal', input: { a: 1 } },
    },
  }
  const required = (rpc: string) =>
    rpc === 'gmail:messageSend' ? ['to', 'subject', 'body'] : undefined
  test('names the required fields an addon step does not hand over, and the stubs', () => {
    const out = graphChecks(
      graph,
      required,
      (rpc) => rpc === 'pipedrive__createDeal'
    )
    assert.deepEqual(out.missingRequiredInputs, { send: ['to'] })
    assert.deepEqual(out.stubs, ['deal'])
  })
  test('a clean graph reports nothing', () => {
    const out = graphChecks(
      {
        nodes: {
          a: { rpcName: 'graph:sort', input: { items: { $ref: 'x' } } },
        },
      },
      () => ['items'],
      () => false
    )
    assert.deepEqual(out, { missingRequiredInputs: {}, stubs: [] })
  })
})

describe('field shapes', () => {
  test('an array of objects shows the object shape (a Gmail `to`)', () => {
    const lines = describeSchema({
      required: ['to'],
      properties: {
        to: {
          type: 'array',
          items: {
            type: 'object',
            required: ['email'],
            properties: { email: { type: 'string' }, name: { type: 'string' } },
          },
        },
        note: { type: 'object', properties: { a: { type: 'string' } } },
      },
    })
    assert.deepEqual(lines, [
      'to: array<{ email: string, name?: string }>',
      'note?: { a?: string }',
    ])
  })
  test('graphChecks says how a missing field is written when it can', () => {
    const out = graphChecks(
      { nodes: { send: { rpcName: 'gmail:messageSend', input: {} } } },
      () => ['to'],
      () => false,
      () => ({ to: 'array<{ email: string }>' })
    )
    assert.deepEqual(out.missingRequiredInputs, {
      send: ['to: array<{ email: string }>'],
    })
  })
})
