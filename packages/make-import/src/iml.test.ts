import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { imlToN8n, bridgeMapper, hasNestedRef } from './iml.js'
import { classifyExpression } from '../../n8n-import/src/expressions.js'

const ids = new Map([
  [1, 'sheets1'],
  [37, 'http37'],
])
const ctx = { nameToNodeId: { sheets1: 'sheets1', http37: 'http37' } }

describe('imlToN8n', () => {
  it('leaves a plain literal untouched', () => {
    assert.equal(imlToN8n('hello', ids), 'hello')
    assert.equal(imlToN8n(42, ids), 42)
  })

  it('bridges a field ref', () => {
    assert.equal(imlToN8n('{{1.email}}', ids), '={{ $node["sheets1"].json.email }}')
  })

  it('bridges a backtick column ref to bracket access', () => {
    assert.equal(imlToN8n('{{1.`0`}}', ids), '={{ $node["sheets1"].json["0"] }}')
  })

  it('bridges a nested path', () => {
    assert.equal(
      imlToN8n('{{1.a.`b c`.d}}', ids),
      '={{ $node["sheets1"].json.a["b c"].d }}'
    )
  })

  it('keeps surrounding text (a template)', () => {
    assert.equal(imlToN8n('Hi {{1.name}}!', ids), '=Hi {{ $node["sheets1"].json.name }}!')
  })

  it('preserves IML function calls verbatim (they must stay transforms)', () => {
    assert.equal(imlToN8n('{{split(1.`1`; space)}}', ids), '={{ split(1.`1`; space) }}')
  })

  it('preserves array-iteration refs verbatim (no per-item graph semantics)', () => {
    assert.equal(
      imlToN8n('{{37.data.records[].fields.Site}}', ids),
      '={{ 37.data.records[].fields.Site }}'
    )
  })

  it('does not resolve a ref to a module outside the flow', () => {
    assert.equal(imlToN8n('{{999.x}}', ids), '={{ 999.x }}')
  })
})

describe('bridged values classify into the right tier', () => {
  const tier = (iml: string) => classifyExpression(imlToN8n(iml, ids), ctx).kind

  it('field ref → ref', () => assert.equal(tier('{{1.email}}'), 'ref'))
  it('column ref → ref', () => assert.equal(tier('{{1.`0`}}'), 'ref'))
  it('text + ref → template', () => assert.equal(tier('Hi {{1.name}}!'), 'template'))
  it('function call → transform', () =>
    assert.equal(tier('{{split(1.`1`; space)}}'), 'transform'))
  it('array iteration → transform', () =>
    assert.equal(tier('{{37.data.records[].fields.Site}}'), 'transform'))
  it('plain literal → literal', () => assert.equal(tier('hello'), 'literal'))

  it('a ref lowers to the right node and path', () => {
    const c = classifyExpression(imlToN8n('{{1.`0`}}', ids), ctx)
    assert.equal(c.kind, 'ref')
    if (c.kind === 'ref') {
      assert.equal(c.nodeId, 'sheets1')
      assert.equal(c.path, '0')
    }
  })
})

describe('bridgeMapper', () => {
  it('bridges refs nested in arrays and objects', () => {
    const out = bridgeMapper({ to: ['{{1.`0`}}'], opt: { cc: '{{1.x}}' } }, ids) as any
    assert.equal(out.to[0], '={{ $node["sheets1"].json["0"] }}')
    assert.equal(out.opt.cc, '={{ $node["sheets1"].json.x }}')
  })

  it('detects a ref nested inside a container', () => {
    assert.equal(hasNestedRef(bridgeMapper({ to: ['{{1.`0`}}'] }, ids)), true)
  })

  it('a top-level scalar ref is not a nested ref', () => {
    assert.equal(hasNestedRef(bridgeMapper({ to: '{{1.`0`}}' }, ids)), false)
  })
})
