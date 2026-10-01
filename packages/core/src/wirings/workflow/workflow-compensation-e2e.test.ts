import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { ContextAwareRPCService } from '../rpc/rpc-runner.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import { runWorkflowGraph } from './graph/graph-runner.js'

/**
 * No fake rpc here: steps go through the real RPC service into the real
 * function runner, so a `compensate` declared on a function config is what
 * runs as `<id>:compensate`.
 */
const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }

let log: string[]
let seen: Record<string, unknown>

const declare = (
  name: string,
  forward: (data: any) => Promise<any>,
  undo?: (data: any, compensatingFor: any) => Promise<void>
) => {
  addFunction(name, {
    func: async (_services: any, data: any) => {
      log.push(`do:${name}`)
      return forward(data)
    },
    ...(undo
      ? {
          compensate: async (_services: any, data: any, wire: any) => {
            log.push(`undo:${name}`)
            seen[name] = wire.workflow?.compensatingFor
            await undo(data, wire.workflow?.compensatingFor)
          },
        }
      : {}),
  } as any)
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    inputSchemaName: null,
    outputSchemaName: null,
    ...(undo ? { compensate: true } : {}),
  } as any
}

const realRpc = () => {
  const services = pikkuState(null, 'package', 'singletonServices') as any
  return new ContextAwareRPCService(services, {}, { requiresAuth: false })
}

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as any)
  log = []
  seen = {}
})

describe('compensation end to end — declared on the function, run by the engine', () => {
  test('a DSL workflow unwinds through the real rpc service', async () => {
    declare(
      'reserve',
      async () => ({ hold: 'h1' }),
      async () => {}
    )
    declare(
      'charge',
      async () => {
        throw new Error('card declined')
      },
      async () => {}
    )
    pikkuState(null, 'workflows', 'meta')['checkout'] = {
      name: 'checkout',
      pikkuFuncId: 'checkout',
      source: 'dsl',
      graphHash: 'checkout-hash',
    } as any
    pikkuState(null, 'function', 'meta')['checkout'] = {
      name: 'checkout',
      sessionless: true,
      permissions: [],
    } as any
    addWorkflow('checkout', {
      func: async (_s: any, _input: any, wire: any) => {
        await wire.workflow.do('Reserve', 'reserve', { sku: 'a' })
        await wire.workflow.do(
          'Charge',
          'charge',
          { amount: 5 },
          { retries: 0 }
        )
      },
    } as any)

    const ws = new InMemoryWorkflowService()
    let runId = ''
    await ws
      .startWorkflow('checkout', {}, { type: 'test' }, realRpc() as any, {
        inline: true,
        onRunCreated: (id) => {
          runId = id
        },
      })
      .catch(() => {})

    assert.equal((await ws.getRun(runId))!.status, 'compensated')
    assert.deepEqual(log, [
      'do:reserve',
      'do:charge',
      'undo:charge',
      'undo:reserve',
    ])
    assert.deepEqual((seen.reserve as any).output, { hold: 'h1' })
    assert.equal((seen.charge as any).ok, false)
  })

  test('a graph workflow unwinds through the real rpc service', async () => {
    declare(
      'reserve',
      async () => ({ hold: 'h1' }),
      async () => {}
    )
    declare('ship', async () => {
      throw new Error('carrier down')
    })
    pikkuState(null, 'workflows', 'meta')['fulfil'] = {
      name: 'fulfil',
      pikkuFuncId: 'fulfil',
      source: 'graph',
      entryNodeIds: ['reserve'],
      graphHash: 'fulfil-hash',
      nodes: {
        reserve: { nodeId: 'reserve', rpcName: 'reserve', next: 'ship' },
        ship: { nodeId: 'ship', rpcName: 'ship', retries: 0 },
      },
    } as any

    const ws = new InMemoryWorkflowService()
    const { runId } = await runWorkflowGraph(
      ws,
      'fulfil',
      {},
      realRpc() as any,
      true
    )

    assert.equal((await ws.getRun(runId))!.status, 'compensated')
    assert.deepEqual(log, ['do:reserve', 'do:ship', 'undo:reserve'])
    assert.deepEqual((seen.reserve as any).output, { hold: 'h1' })
  })
})
