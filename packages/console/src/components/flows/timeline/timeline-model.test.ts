import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildFlowTimeline, summarizeArgs } from './timeline-model.js'

const ORDER_SUPPORT_NODES = {
  step_0: {
    nodeId: 'step_0',
    flow: 'branch',
    branches: [],
    next: 'shopper doubles their order',
  },
  'shopper doubles their order': {
    nodeId: 'shopper doubles their order',
    rpcName: 'doubleValue',
    next: 'support sees the greeting settle',
    actor: 'shopper',
    input: { value: { $ref: 'trigger', path: 'value' } },
  },
  'support sees the greeting settle': {
    nodeId: 'support sees the greeting settle',
    rpcName: 'formatMessage',
    next: 'step_3',
    actor: 'support',
    expectEventually: true,
    input: { greeting: 'Hello', name: 'Support' },
  },
  step_3: { nodeId: 'step_3', flow: 'return', outputs: {} },
}

test('buildFlowTimeline orders by next, drops structural branch and return nodes, and maps kinds', () => {
  const timeline = buildFlowTimeline(ORDER_SUPPORT_NODES as any, ['step_0'])

  assert.deepEqual(
    timeline.map((n) => n.nodeId),
    ['shopper doubles their order', 'support sees the greeting settle']
  )
  assert.deepEqual(
    timeline.map((n) => n.kind),
    ['rpc', 'eventual']
  )
  assert.equal(timeline[0].actor, 'shopper')
  assert.equal(timeline[1].actor, 'support')
  assert.equal(timeline[1].expectEventually, true)
})

test('buildFlowTimeline appends nodes unreachable via next in insertion order', () => {
  const nodes = {
    a: { nodeId: 'a', rpcName: 'first', next: 'c' },
    b: { nodeId: 'b', rpcName: 'orphan' },
    c: { nodeId: 'c', flow: 'return' },
  }
  const timeline = buildFlowTimeline(nodes as any, ['a'])
  assert.deepEqual(
    timeline.map((n) => n.nodeId),
    ['a', 'b']
  )
})

test('buildFlowTimeline walks every entry root in entryNodeIds order', () => {
  const nodes = {
    r1: { nodeId: 'r1', rpcName: 'one' },
    r3: { nodeId: 'r3', rpcName: 'three' },
    r2: { nodeId: 'r2', rpcName: 'two' },
  }
  const timeline = buildFlowTimeline(nodes as any, ['r1', 'r2', 'r3'])
  assert.deepEqual(
    timeline.map((n) => n.nodeId),
    ['r1', 'r2', 'r3']
  )
})

test('summarizeArgs renders $ref paths and primitives', () => {
  assert.equal(
    summarizeArgs({ value: { $ref: 'trigger', path: 'value' } }),
    'value: trigger.value'
  )
  assert.equal(
    summarizeArgs({ greeting: 'Hello', name: 'Support' }),
    'greeting: "Hello", name: "Support"'
  )
  assert.equal(summarizeArgs(undefined), '')
})
