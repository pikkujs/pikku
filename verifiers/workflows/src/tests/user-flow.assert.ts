/**
 * Verifies pikkuUserFlow end-to-end through real codegen:
 * - inspector meta: source 'user-flow', actor + internal + expectEventually steps
 * - runtime: the flow runs with injected actors; actor steps go through the
 *   actor (never internal dispatch), internal steps still hit the real function
 *
 * Expects: pikku has been run first to generate .pikku/ files
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { InMemoryWorkflowService } from '@pikku/core/services'
import type { UserFlowActor } from '@pikku/core/services'
import { rpcService } from '@pikku/core/rpc'

import '../../.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from '../services.js'

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

const fakeActor = (
  name: string
): UserFlowActor & { calls: Array<{ rpcName: string; data: any }> } => {
  const calls: Array<{ rpcName: string; data: any }> = []
  return {
    name,
    calls,
    invoke: async (rpcName: string, data: any) => {
      calls.push({ rpcName, data })
      // Order-shaped response, as the deployed app would return over HTTP
      return {
        id: data.orderId,
        customerId: 'customer-1',
        items: [],
        total: 0,
        status: 'processing',
        createdAt: 'now',
      }
    },
  }
}

describe('pikkuUserFlow verification', () => {
  test('meta: user flow is inspected with source user-flow and all steps', async () => {
    const meta = await loadMeta('orderHealthUserFlow')
    assert.equal(meta.source, 'user-flow')

    // Nodes are keyed by step name
    const nodes: Record<string, any> = meta.nodes || {}
    assert.ok(
      nodes['customer fetches the order'],
      `actor step captured, got: ${Object.keys(nodes).join(', ')}`
    )
    assert.ok(nodes['internal re-read'], 'internal step captured')

    const rpcNodes = Object.values(nodes).filter((n: any) => n.rpcName)
    assert.ok(rpcNodes.length >= 2, 'both do-steps are rpc nodes')
    assert.ok(
      rpcNodes.every((n: any) => n.rpcName === 'orderGet'),
      'rpc steps resolve to the real RPC name'
    )
  })

  test('codegen: pikku.config.json userFlows.actors generates the typed registry', async () => {
    const gen = await import(
      '../../.pikku/workflow/pikku-user-flow-actors.gen.js'
    )
    assert.deepEqual(Object.keys(gen.userFlowActorConfigs).sort(), [
      'customer',
      'ops',
    ])
    assert.equal(gen.userFlowActorConfigs.customer.jobTitle, 'Customer')

    const actors = gen.createUserFlowActors({
      apiUrl: 'http://localhost:9999/api',
      secret: 'unused',
    })
    assert.equal(actors.customer.name, 'customer')
    assert.equal(typeof actors.ops.invoke, 'function')
  })

  test('runtime: actor steps route through injected actors, internal steps stay in-process', async () => {
    const customer = fakeActor('customer')
    const ops = fakeActor('ops')

    const workflowService = new InMemoryWorkflowService()
    const singletonServices = await createSingletonServices(
      await createConfig(),
      {
        workflowService,
        actors: { customer, ops },
      }
    )
    const rpc = rpcService.getContextRPCService(
      singletonServices as any,
      {},
      false
    )

    const { runId } = await workflowService.startWorkflow(
      'orderHealthUserFlow',
      { orderId: 'order-7' },
      { type: 'test' },
      rpc
    )

    const deadline = Date.now() + 10_000
    let run = await workflowService.getRun(runId)
    while (run && run.status !== 'completed' && run.status !== 'failed') {
      if (Date.now() > deadline) {
        throw new Error(`user flow timed out (status: ${run.status})`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
      run = await workflowService.getRun(runId)
    }

    assert.equal(run?.status, 'completed', `run failed: ${run?.error}`)
    assert.deepEqual(run?.output, { status: 'processing', sameOrder: true })

    assert.deepEqual(
      customer.calls,
      [{ rpcName: 'orderGet', data: { orderId: 'order-7' } }],
      'customer step went through the actor exactly once'
    )
    assert.ok(ops.calls.length >= 1, 'expectEventually polled as ops')
    assert.ok(
      ops.calls.every((c) => c.rpcName === 'orderGet'),
      'ops polled the expected RPC'
    )
  })
})
