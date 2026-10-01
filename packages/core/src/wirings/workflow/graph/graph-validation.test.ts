import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generateMermaidDiagram } from './graph-validation.js'

describe('generateMermaidDiagram', () => {
  it('generates valid mermaid output', () => {
    const nodes = {
      start: { rpcName: 'toolA', next: 'end' },
      end: { rpcName: 'toolB' },
    }
    const result = generateMermaidDiagram('test-wf', nodes, ['start'])
    assert.ok(result.includes('graph TD'))
    assert.ok(result.includes('start([toolA])'))
    assert.ok(result.includes('end[toolB]'))
    assert.ok(result.includes('start --> end'))
  })

  it('shows recover edges with dotted lines', () => {
    const nodes = {
      start: { rpcName: 'toolA', recover: 'handler' },
      handler: { rpcName: 'toolB' },
    }
    const result = generateMermaidDiagram('test-wf', nodes, ['start'])
    assert.ok(result.includes('start -.->|recover| handler'))
  })

  it("draws no recover edge for recover: 'ignore'", () => {
    const nodes = { start: { rpcName: 'toolA', recover: 'ignore' } }
    const result = generateMermaidDiagram('test-wf', nodes, ['start'])
    assert.ok(!result.includes('ignore'))
  })
})
