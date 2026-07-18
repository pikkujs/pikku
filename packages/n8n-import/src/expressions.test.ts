import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyExpression, type ExprContext } from './expressions.js'

const ctx: ExprContext = {
  predecessorNodeId: 'prev',
  nameToNodeId: {
    'Fetch Customer': 'Fetch_Customer',
    'Set Config': 'Set_Config',
  },
}

test('$json lowers to a predecessor ref', () => {
  assert.deepEqual(classifyExpression('={{ $json.email }}', ctx), {
    kind: 'ref',
    nodeId: 'prev',
    path: 'email',
  })
})

test('$(name).item.json.<path> — the existing pure-ref form', () => {
  assert.deepEqual(
    classifyExpression("={{ $('Fetch Customer').item.json.email }}", ctx),
    { kind: 'ref', nodeId: 'Fetch_Customer', path: 'email' }
  )
})

test('$(name).first().json.<path> collapses to a cross-node ref', () => {
  assert.deepEqual(
    classifyExpression("={{ $('Fetch Customer').first().json.email }}", ctx),
    { kind: 'ref', nodeId: 'Fetch_Customer', path: 'email' }
  )
})

test('$(name).json.<path> shorthand collapses to a cross-node ref', () => {
  assert.deepEqual(
    classifyExpression("={{ $('Set Config').json.apiBase }}", ctx),
    { kind: 'ref', nodeId: 'Set_Config', path: 'apiBase' }
  )
})

test('$node["name"].item.json.<path> collapses to a cross-node ref', () => {
  assert.deepEqual(
    classifyExpression('={{ $node["Fetch Customer"].item.json.id }}', ctx),
    { kind: 'ref', nodeId: 'Fetch_Customer', path: 'id' }
  )
})

test('$(name).first().json with no trailing path → pathless ref', () => {
  assert.deepEqual(
    classifyExpression("={{ $('Fetch Customer').first().json }}", ctx),
    { kind: 'ref', nodeId: 'Fetch_Customer', path: undefined }
  )
})

test('a .first() cross-node ref inside surrounding text → template', () => {
  const r = classifyExpression(
    "=Hi {{ $('Fetch Customer').first().json.name }}!",
    ctx
  )
  assert.equal(r.kind, 'template')
  assert.deepEqual((r as { refs: unknown[] }).refs, [
    { nodeId: 'Fetch_Customer', path: 'name' },
  ])
})

test('.last() stays a transform — item-array semantics are out of scope', () => {
  assert.equal(
    classifyExpression("={{ $('Fetch Customer').last().json.x }}", ctx).kind,
    'transform'
  )
})

test('.all() stays a transform — item-array semantics are out of scope', () => {
  assert.equal(
    classifyExpression("={{ $('Fetch Customer').all() }}", ctx).kind,
    'transform'
  )
})

test('arithmetic across two refs stays a transform', () => {
  assert.equal(
    classifyExpression(
      "={{ $('Set Config').json.a + $('Fetch Customer').first().json.b }}",
      ctx
    ).kind,
    'transform'
  )
})
