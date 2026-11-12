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
