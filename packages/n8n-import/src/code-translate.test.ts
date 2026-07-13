import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translateCodeNode } from './code-translate.js'
import type { ParsedNode } from './types.js'

const codeNode = (
  parameters: Record<string, unknown>,
  typeShort = 'code'
): ParsedNode => ({
  id: '1',
  name: 'Score',
  nodeId: 'score',
  type: `n8n-nodes-base.${typeShort}`,
  typeShort,
  parameters,
  disabled: false,
  role: 'code',
  rpcName: 'codeStubScore',
})

test('a pure runOnceForAllItems body is translatable in "all" mode', () => {
  const t = translateCodeNode(
    codeNode({
      jsCode: 'return items.map(i => ({ json: { x: i.json.v * 2 } }))',
    })
  )
  assert.equal(t.translatable, true)
  assert.equal(t.translatable && t.mode, 'all')
})

test('mode runOnceForEachItem is translatable in "each" mode', () => {
  const t = translateCodeNode(
    codeNode({
      mode: 'runOnceForEachItem',
      jsCode: '$json.x = 1; return $input.item',
    })
  )
  assert.equal(t.translatable, true)
  assert.equal(t.translatable && t.mode, 'each')
})

test('a legacy functionItem node is translated per-item', () => {
  const t = translateCodeNode(
    codeNode({ functionCode: 'item.json.x = 1;\nreturn item' }, 'functionItem')
  )
  assert.equal(t.translatable, true)
  assert.equal(t.translatable && t.mode, 'each')
})

test('require() bails to a stub', () => {
  const t = translateCodeNode(
    codeNode({ jsCode: "const _ = require('lodash'); return items" })
  )
  assert.equal(t.translatable, false)
  assert.equal(!t.translatable && /require/.test(t.reason), true)
})

test('a cross-node reference ($(...)) bails to a stub', () => {
  const t = translateCodeNode(
    codeNode({ jsCode: 'return [{ json: { v: $("Other").item.json.v } }]' })
  )
  assert.equal(t.translatable, false)
})

test('$env, await and fetch each bail (side effects / environment)', () => {
  assert.equal(
    translateCodeNode(codeNode({ jsCode: 'return $env.KEY' })).translatable,
    false
  )
  assert.equal(
    translateCodeNode(codeNode({ jsCode: 'await x(); return items' }))
      .translatable,
    false
  )
  assert.equal(
    translateCodeNode(codeNode({ jsCode: 'await fetch(u); return []' }))
      .translatable,
    false
  )
})

test('empty code and non-JS languages bail', () => {
  assert.equal(
    translateCodeNode(codeNode({ jsCode: '   ' })).translatable,
    false
  )
  assert.equal(
    translateCodeNode(
      codeNode({ language: 'python', pythonCode: 'return items' })
    ).translatable,
    false
  )
})

test('a `.import(` method call is not mistaken for an ES import', () => {
  const t = translateCodeNode(
    codeNode({ jsCode: 'return items.map(i => db.import(i.json))' })
  )
  assert.equal(t.translatable, true)
})
