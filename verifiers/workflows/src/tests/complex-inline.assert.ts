/**
 * Verifies that pikkuWorkflowComplexFunc with inline steps
 * produces correct metadata with full DSL extraction.
 *
 * Expects: pikku has been run first to generate .pikku/workflow/meta/ files
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const META_DIR = join(__dirname, '../../.pikku/workflow/meta')

async function loadMeta(name: string) {
  const files = [
    join(META_DIR, `${name}-verbose.gen.json`),
    join(META_DIR, `${name}.gen.json`),
  ]
  for (const f of files) {
    try {
      return JSON.parse(await readFile(f, 'utf-8'))
    } catch {}
  }
  throw new Error(`Meta not found for workflow: ${name}`)
}

function getNodes(meta: any): Record<string, any> {
  return meta.nodes || {}
}

function findNodesByFlow(nodes: Record<string, any>, flow: string): any[] {
  return Object.values(nodes).filter((n: any) => n.flow === flow)
}

function findRpcNodes(nodes: Record<string, any>): any[] {
  return Object.values(nodes).filter((n: any) => n.rpcName && !n.flow)
}

describe('complex inline workflow extraction', () => {
  test('complexInlineWorkflow has inline and rpc nodes with branch metadata', async () => {
    const meta = await loadMeta('complexInlineWorkflow')
    const nodes = getNodes(meta)

    assert.equal(meta.source, 'complex')
    assert.ok(Object.keys(nodes).length > 0, 'should have nodes')

    const rpcNodes = findRpcNodes(nodes)
    const inlineNodes = findNodesByFlow(nodes, 'inline')
    const branchNodes = findNodesByFlow(nodes, 'branch')

    assert.ok(
      rpcNodes.length >= 1,
      `should have rpc nodes, got ${rpcNodes.length}`
    )
    assert.ok(
      inlineNodes.length >= 1,
      `should have inline nodes, got ${inlineNodes.length}`
    )
    assert.ok(
      branchNodes.length >= 1,
      `should have branch nodes, got ${branchNodes.length}`
    )

    const processNode = inlineNodes.find(
      (n: any) => n.nodeId === 'Process locally'
    )
    assert.ok(processNode, 'should have "Process locally" inline node')

    const branch = branchNodes[0]
    assert.ok(
      branch.branches?.length >= 1,
      'branch should have at least 1 condition'
    )
    assert.ok(branch.elseEntry, 'branch should have an else path')
  })

  test('complexInlineSwitchWorkflow has inline nodes inside switch cases', async () => {
    const meta = await loadMeta('complexInlineSwitchWorkflow')
    const nodes = getNodes(meta)

    assert.equal(meta.source, 'complex')

    const inlineNodes = findNodesByFlow(nodes, 'inline')
    const switchNodes = findNodesByFlow(nodes, 'switch')

    assert.ok(
      inlineNodes.length >= 2,
      `should have at least 2 inline nodes, got ${inlineNodes.length}`
    )
    assert.ok(
      switchNodes.length >= 1,
      `should have switch node, got ${switchNodes.length}`
    )

    const prepareNode = inlineNodes.find((n: any) => n.nodeId === 'Prepare')
    assert.ok(prepareNode, 'should have "Prepare" inline node')

    const transformNode = inlineNodes.find(
      (n: any) => n.nodeId === 'Transform locally'
    )
    assert.ok(transformNode, 'should have "Transform locally" inline node')
  })

  test('complexInlineParallelWorkflow has inline node after parallel', async () => {
    const meta = await loadMeta('complexInlineParallelWorkflow')
    const nodes = getNodes(meta)

    assert.equal(meta.source, 'complex')

    const inlineNodes = findNodesByFlow(nodes, 'inline')
    assert.ok(
      inlineNodes.length >= 1,
      `should have at least 1 inline node, got ${inlineNodes.length}`
    )

    const combineNode = inlineNodes.find(
      (n: any) => n.nodeId === 'Combine results'
    )
    assert.ok(combineNode, 'should have "Combine results" inline node')
  })

  test('inline nodes should not have rpcName or stepHash', async () => {
    const meta = await loadMeta('complexInlineWorkflow')
    const nodes = getNodes(meta)
    const inlineNodes = findNodesByFlow(nodes, 'inline')

    for (const node of inlineNodes) {
      assert.equal(
        node.rpcName,
        undefined,
        `inline node "${node.nodeId}" should not have rpcName`
      )
      assert.equal(
        node.stepHash,
        undefined,
        `inline node "${node.nodeId}" should not have stepHash`
      )
    }
  })

  test('rpc nodes should have rpcName and stepHash', async () => {
    const meta = await loadMeta('complexInlineWorkflow')
    const nodes = getNodes(meta)
    const rpcNodes = findRpcNodes(nodes)

    for (const node of rpcNodes) {
      assert.ok(node.rpcName, `rpc node "${node.nodeId}" should have rpcName`)
      assert.ok(node.stepHash, `rpc node "${node.nodeId}" should have stepHash`)
    }
  })
})
