/**
 * Verifies a declarative graph node that fans out over an upstream collection.
 *
 * Two layers at once: the inspector has to lower `forEach` + `$item` from real
 * source into the generated meta, and the runner has to turn that meta into one
 * step instance per element whose results fold back into a single array for the
 * downstream node.
 *
 * Expects: pikku has been run first to generate .pikku/workflow/meta/ files
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { InMemoryWorkflowService } from '@pikku/core/services'
import { rpcService } from '@pikku/core/rpc'

import '../../.pikku/pikku-bootstrap.gen.js'
import { createSingletonServices } from '../services.js'
import { createConfig } from '../config.js'

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
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }
  }
  throw new Error(`Meta not found for workflow: ${name}`)
}

async function runGraph(name: string, input: unknown) {
  const workflowService = new InMemoryWorkflowService()
  const singletonServices = await createSingletonServices(
    await createConfig(),
    {
      workflowService,
    }
  )
  const rpc = rpcService.getContextRPCService(singletonServices as any, {})

  const { runId } = await workflowService.startWorkflow(
    name,
    input,
    { type: 'test' },
    rpc,
    { inline: true }
  )

  const deadline = Date.now() + 10_000
  let run = await workflowService.getRun(runId)
  while (run && run.status !== 'completed' && run.status !== 'failed') {
    if (Date.now() > deadline) {
      throw new Error(`graph ${name} timed out (status: ${run.status})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
    run = await workflowService.getRun(runId)
  }

  const steps = await workflowService.getStepInstances(runId)
  // A graph run carries no output of its own — the terminal node's result is
  // read back off the run.
  const resultOf = async (nodeId: string) =>
    (await workflowService.getNodeResults(runId, [nodeId]))[nodeId]
  return { run, steps, workflowService, runId, resultOf }
}

describe('graph forEach fan-out', () => {
  test('meta: the fanned node carries its forEach source and $item input', async () => {
    const meta = await loadMeta('graphShipmentFanout')
    assert.equal(meta.source, 'graph')

    const nodes: Record<string, any> = meta.nodes || {}
    const label = nodes['label']
    assert.ok(label, `no 'label' node, got: ${Object.keys(nodes).join(', ')}`)
    assert.deepEqual(
      label.forEach,
      { $ref: 'list', path: 'shipments' },
      'the (ref) callback should lower into a DataRef with its path'
    )
    assert.deepEqual(label.input, {
      shipmentId: { $ref: '$item', path: 'shipmentId' },
      weightKg: { $ref: '$item', path: 'weightKg' },
    })
    // Parallel is the default and is not written out.
    assert.equal(label.mode, undefined)
  })

  test('meta: a sequential fan-out records its mode', async () => {
    const meta = await loadMeta('graphShipmentFanoutSequential')
    assert.equal(meta.nodes?.label?.mode, 'sequential')
  })

  test('runtime: one step instance per element, keyed node[i]', async () => {
    const { run, steps } = await runGraph('graphShipmentFanout', {
      orderId: 'order-1',
    })

    assert.equal(run?.status, 'completed', `run failed: ${run?.error?.message}`)
    assert.deepEqual(
      steps.map((s) => s.stepName).sort(),
      ['label[0]', 'label[1]', 'label[2]', 'list', 'manifest'],
      'each element should get its own instance, and the node itself none'
    )
  })

  test('runtime: the downstream node folds the per-item results in order', async () => {
    const { run, resultOf } = await runGraph('graphShipmentFanout', {
      orderId: 'order-2',
    })

    assert.equal(run?.status, 'completed', `run failed: ${run?.error?.message}`)
    assert.deepEqual(await resultOf('manifest'), {
      count: 3,
      totalCents: 600,
      labels: ['LBL-order-2-a', 'LBL-order-2-b', 'LBL-order-2-c'],
    })
  })

  test('runtime: each instance keeps its own item, and only its own', async () => {
    const { resultOf } = await runGraph('graphShipmentFanout', {
      orderId: 'order-4',
    })

    assert.deepEqual(
      await Promise.all([
        resultOf('label[0]'),
        resultOf('label[1]'),
        resultOf('label[2]'),
      ]),
      [
        { shipmentId: 'order-4-a', label: 'LBL-order-4-a', costCents: 100 },
        { shipmentId: 'order-4-b', label: 'LBL-order-4-b', costCents: 200 },
        { shipmentId: 'order-4-c', label: 'LBL-order-4-c', costCents: 300 },
      ]
    )
  })

  test('runtime: a sequential fan-out reaches the same result', async () => {
    const { run, steps, resultOf } = await runGraph(
      'graphShipmentFanoutSequential',
      { orderId: 'order-3' }
    )

    assert.equal(run?.status, 'completed', `run failed: ${run?.error?.message}`)
    assert.deepEqual(steps.map((s) => s.stepName).sort(), [
      'label[0]',
      'label[1]',
      'label[2]',
      'list',
      'manifest',
    ])
    assert.deepEqual(await resultOf('manifest'), {
      count: 3,
      totalCents: 600,
      labels: ['LBL-order-3-a', 'LBL-order-3-b', 'LBL-order-3-c'],
    })
  })
})
