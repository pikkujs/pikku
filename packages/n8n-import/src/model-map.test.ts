import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapModel, mapOpenAiNodeModel } from './model-map.js'
import type { ParsedNode } from './types.js'

const node = (parameters: Record<string, unknown>): ParsedNode =>
  ({
    typeShort: 'lmChatOpenAi',
    parameters,
  }) as unknown as ParsedNode

test('mapModel maps a static model id to provider/model', () => {
  assert.deepEqual(mapModel(node({ model: 'gpt-4o-mini' })), {
    model: 'openai/gpt-4o-mini',
    temperature: undefined,
  })
})

test('mapModel reads temperature from options', () => {
  const r = mapModel(node({ model: 'gpt-4o', options: { temperature: 0.3 } }))
  assert.equal(r?.temperature, 0.3)
})

test('mapModel rejects a dynamic (expression) model id → undefined (TODO default)', () => {
  // a runtime-chosen model id would otherwise emit an unquotable/invalid string
  assert.equal(
    mapModel(node({ model: "={{ $node['x'].json.id }}" })),
    undefined
  )
  assert.equal(
    mapModel(node({ model: { value: '={{ $json.model }}' } })),
    undefined
  )
  assert.equal(mapModel(node({ modelName: '={{ $json.m }}' })), undefined)
})

const openAiNode = (parameters: Record<string, unknown>): ParsedNode =>
  ({ typeShort: 'openAi', parameters }) as unknown as ParsedNode

test('mapOpenAiNodeModel reads an inline `model` string → openai/<id>', () => {
  assert.deepEqual(mapOpenAiNodeModel(openAiNode({ model: 'gpt-4o' })), {
    model: 'openai/gpt-4o',
    temperature: undefined,
  })
})

test('mapOpenAiNodeModel reads a `modelId` resource-locator', () => {
  const r = mapOpenAiNodeModel(
    openAiNode({ modelId: { __rl: true, value: 'gpt-4o-mini', mode: 'list' } })
  )
  assert.equal(r?.model, 'openai/gpt-4o-mini')
})

test('mapOpenAiNodeModel reads temperature from options', () => {
  const r = mapOpenAiNodeModel(
    openAiNode({ model: 'gpt-4o', options: { temperature: 0.8 } })
  )
  assert.equal(r?.temperature, 0.8)
})

test('mapOpenAiNodeModel with no static model id → undefined (TODO default)', () => {
  assert.equal(mapOpenAiNodeModel(openAiNode({})), undefined)
  assert.equal(
    mapOpenAiNodeModel(openAiNode({ model: '={{ $json.model }}' })),
    undefined
  )
})
