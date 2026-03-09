import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeEntryNodeIds,
  validateWorkflowWiring,
  generateMermaidDiagram,
} from './graph-validation.js'

describe('computeEntryNodeIds', () => {
  it('returns nodes not referenced by any other node', () => {
    const nodes = {
      start: { rpcName: 'a', next: 'middle' },
      middle: { rpcName: 'b', next: 'end' },
      end: { rpcName: 'c' },
    }
    assert.deepEqual(computeEntryNodeIds(nodes), ['start'])
  })

  it('returns multiple entry nodes for parallel starts', () => {
    const nodes = {
      a: { rpcName: 'x' },
      b: { rpcName: 'y' },
      c: { rpcName: 'z', next: 'a' },
    }
    const entries = computeEntryNodeIds(nodes)
    assert.ok(entries.includes('b'))
    assert.ok(entries.includes('c'))
    assert.ok(!entries.includes('a'))
  })

  it('returns empty for fully circular graph', () => {
    const nodes = {
      a: { rpcName: 'x', next: 'b' },
      b: { rpcName: 'y', next: 'a' },
    }
    assert.deepEqual(computeEntryNodeIds(nodes), [])
  })

  it('handles onError references', () => {
    const nodes = {
      start: { rpcName: 'a', next: 'ok', onError: 'err' },
      ok: { rpcName: 'b' },
      err: { rpcName: 'c' },
    }
    assert.deepEqual(computeEntryNodeIds(nodes), ['start'])
  })

  it('handles branching next as object', () => {
    const nodes = {
      start: { rpcName: 'a', next: { yes: 'b', no: 'c' } },
      b: { rpcName: 'x' },
      c: { rpcName: 'y' },
    }
    assert.deepEqual(computeEntryNodeIds(nodes), ['start'])
  })

  it('handles parallel next as array', () => {
    const nodes = {
      start: { rpcName: 'a', next: ['b', 'c'] },
      b: { rpcName: 'x' },
      c: { rpcName: 'y' },
    }
    assert.deepEqual(computeEntryNodeIds(nodes), ['start'])
  })
})

describe('validateWorkflowWiring', () => {
  const tools = ['toolA', 'toolB', 'toolC']

  it('returns no errors for a valid workflow', () => {
    const nodes = {
      step1: { rpcName: 'toolA', input: {}, next: 'step2' },
      step2: { rpcName: 'toolB', input: {} },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.deepEqual(errors, [])
  })

  it('errors on missing rpcName', () => {
    const nodes = {
      step1: { input: {} },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.ok(errors.some((e) => e.includes("missing 'rpcName'")))
  })

  it('errors on unknown tool', () => {
    const nodes = {
      step1: { rpcName: 'unknownTool', input: {} },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.ok(errors.some((e) => e.includes('unknown tool')))
  })

  it('errors on next referencing unknown node', () => {
    const nodes = {
      step1: { rpcName: 'toolA', next: 'nonexistent' },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.ok(errors.some((e) => e.includes("unknown node 'nonexistent'")))
  })

  it('errors on onError referencing unknown node', () => {
    const nodes = {
      step1: { rpcName: 'toolA', onError: 'missing' },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.ok(errors.some((e) => e.includes("unknown node 'missing'")))
  })

  it('errors on input referencing unknown node', () => {
    const nodes = {
      step1: {
        rpcName: 'toolA',
        input: { field: { $ref: 'missing', path: 'x' } },
      },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.ok(errors.some((e) => e.includes("unknown node 'missing'")))
  })

  it('allows trigger refs without errors', () => {
    const nodes = {
      step1: {
        rpcName: 'toolA',
        input: { field: { $ref: 'trigger', path: 'title' } },
        next: 'step2',
      },
      step2: { rpcName: 'toolB', input: {} },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.deepEqual(errors, [])
  })

  it('allows valid node-to-node refs', () => {
    const nodes = {
      step1: { rpcName: 'toolA', input: {}, next: 'step2' },
      step2: {
        rpcName: 'toolB',
        input: { data: { $ref: 'step1', path: 'result' } },
      },
    }
    const errors = validateWorkflowWiring(nodes, tools)
    assert.deepEqual(errors, [])
  })
})

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

  it('shows error edges with dotted lines', () => {
    const nodes = {
      start: { rpcName: 'toolA', onError: 'handler' },
      handler: { rpcName: 'toolB' },
    }
    const result = generateMermaidDiagram('test-wf', nodes, ['start'])
    assert.ok(result.includes('start -.->|error| handler'))
  })
})
