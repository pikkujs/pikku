import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { ContextAwareRPCService } from '../rpc/rpc-runner.js'
import { addWorkflow } from './dsl/workflow-runner.js'

/**
 * An addon keeps its workflow meta under its own package, not the app's. A step
 * in an addon workflow that names another of the addon's workflows — bare, or
 * as `namespace:name` — has to start it as a child, so the child gets its
 * `workflow` wire. Run as a plain RPC instead, the child's first
 * `workflow.do` throws on an undefined `workflow`.
 */
const silentLogger = { error() {}, info() {}, warn() {}, debug() {} }
const PKG = '@test/addon-cloud'

let probed: unknown[]

const addonFunctionMeta = (name: string) => {
  pikkuState(PKG, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    inputSchemaName: null,
    outputSchemaName: null,
  } as any
}

const addonWorkflow = (name: string, func: (wire: any, data: any) => any) => {
  pikkuState(PKG, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'dsl',
    graphHash: `${name}-hash`,
  } as any
  addonFunctionMeta(name)
  addWorkflow(
    name,
    { func: async (_s: any, data: any, wire: any) => func(wire, data) } as any,
    PKG
  )
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
  pikkuState(null, 'addons', 'packages').set('cloud', {
    package: PKG,
  } as any)
  probed = []

  addFunction(
    'probeBuildHost',
    {
      func: async (_s: any, data: any) => {
        probed.push(data)
        return { ready: true, host: data.host }
      },
    } as any,
    PKG
  )
  addonFunctionMeta('probeBuildHost')

  addonWorkflow('waitForBuildHost', (wire, data) => {
    assert.ok(wire.workflow, 'the child must receive its workflow wire')
    return wire.workflow.do('Probe', 'probeBuildHost', data)
  })
})

const deployWith = async (childName: string) => {
  addonWorkflow('deployWorkflow', async (wire, data) => {
    const host = await wire.workflow.do('Wait for host', childName, data)
    return { deployed: true, host }
  })

  const ws = new InMemoryWorkflowService()
  let runId = ''
  await ws.startWorkflow(
    'cloud:deployWorkflow',
    { host: 'bh-1' },
    { type: 'test' },
    realRpc() as any,
    { inline: true, onRunCreated: (id) => (runId = id) }
  )
  const parent = (await ws.getRun(runId))!
  const children: any[] = []
  for (const id of (ws as any).runs.keys()) {
    const run = await ws.getRun(id)
    if (run?.wire?.parentRunId === runId) children.push(run)
  }
  return { parent, children }
}

describe('an addon workflow starts another of its workflows as a child', () => {
  for (const childName of ['waitForBuildHost', 'cloud:waitForBuildHost']) {
    test(`named '${childName}'`, async () => {
      const { parent, children } = await deployWith(childName)

      assert.equal(parent.error?.message, undefined)
      assert.equal(parent.status, 'completed')
      assert.deepEqual(parent.output, {
        deployed: true,
        host: { ready: true, host: 'bh-1' },
      })
      assert.equal(children.length, 1, 'exactly one child run')
      assert.equal(children[0].workflow, 'cloud:waitForBuildHost')
      assert.equal(children[0].status, 'completed')
      assert.deepEqual(probed, [{ host: 'bh-1' }])
    })
  }
})

describe('a queued step that names an addon workflow starts it as a child', () => {
  test('the step worker starts cloud:waitForBuildHost as a child run', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
      queueService: { add: async () => {} },
    } as any)
    const ws = new InMemoryWorkflowService()
    const parentRunId = await ws.createRun(
      'cloud:deployWorkflow',
      {},
      false,
      '',
      { type: 'test' }
    )
    await ws.insertStepState(
      parentRunId,
      'Wait for host',
      'cloud:waitForBuildHost',
      { host: 'bh-2' }
    )

    await (ws as any)
      .executeWorkflowStepInner(
        parentRunId,
        'Wait for host',
        'cloud:waitForBuildHost',
        { host: 'bh-2' },
        realRpc()
      )
      .catch(() => {})

    const children: any[] = []
    for (const id of (ws as any).runs.keys()) {
      const run = await ws.getRun(id)
      if (run?.wire?.parentRunId === parentRunId) children.push(run)
    }
    assert.equal(children.length, 1, 'the step must start a child run')
    assert.equal(children[0].workflow, 'cloud:waitForBuildHost')
  })
})
