import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ForbiddenError,
  MissingScopeError,
  MissingSessionError,
} from '../../errors/errors.js'
import { clearPermissionsCache } from '../../permissions.js'
import {
  pikkuState,
  resetPikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import { addSchema } from '../../schema.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { WorkflowNotFoundError } from './workflow-errors.js'
import {
  checkWorkflowRunAccess,
  checkWorkflowStart,
} from './workflow-run-access.js'
import { WorkflowRunForbiddenError } from './workflow-run-ownership.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} } as any

const schema = {
  compileSchema: async () => {},
  validateSchema: async (_key: string, data: any) => {
    if (typeof data.quantity !== 'number') {
      throw new Error('quantity must be a number')
    }
  },
} as any

const alice = { session: { userId: 'alice' } } as any
const anonymous = {} as any

let ws: InMemoryWorkflowService
let seenSession: unknown
let bodyRuns: number
let services: Record<string, unknown>

type Declaration = {
  expose?: boolean
  auth?: boolean
  scopes?: string[]
  permissions?: Record<string, (...args: any[]) => any>
  inputSchemaName?: string
  /** A queued workflow's function can live in another deploy unit. */
  inThisUnit?: boolean
}

const declare = (name: string, declaration: Declaration = {}) => {
  const { expose = true, auth, inThisUnit = true, ...config } = declaration
  const func = async (_services: unknown, _data: unknown, wire: any) => {
    bodyRuns += 1
    seenSession = wire.session
    return 'done'
  }
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'dsl',
    graphHash: 'hash',
    expose,
    auth,
  } as any
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    name,
    inputSchemaName: config.inputSchemaName ?? null,
    outputSchemaName: null,
    sessionless: auth === false,
  } as any
  if (inThisUnit) {
    pikkuState(null, 'function', 'functions').set(name, {
      func,
      auth,
      ...config,
    } as any)
    pikkuState(null, 'workflows', 'registrations').set(name, {
      name,
      func,
    } as any)
  }
}

const declareGraph = (name: string, over: Record<string, unknown> = {}) => {
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    source: 'graph',
    graphHash: 'hash',
    entryNodeIds: ['first'],
    nodes: { first: { nodeId: 'first', rpcName: 'stepOne', next: undefined } },
    expose: true,
    ...over,
  } as any
}

const useServices = (extra: Record<string, unknown> = {}) => {
  services = { logger, schema, workflowService: ws, ...extra }
  setSingletonServices(services as any)
}

const start = async (name: string, input: unknown, wire: any) => {
  const checked = await checkWorkflowStart(name, input, wire)
  return await ws.startWorkflow(name, checked.input, checked.wire, {} as any, {
    inline: true,
  })
}

const noRuns = async () => assert.equal((await ws.listRuns()).length, 0)

beforeEach(() => {
  resetPikkuState()
  clearPermissionsCache()
  ws = new InMemoryWorkflowService()
  seenSession = undefined
  bodyRuns = 0
  useServices()
  addSchema('FlowInput', { type: 'object' })
})

describe('a route refuses a start at the request, leaving no run', () => {
  test('a workflow that is not exposed, or does not exist, is a 404', async () => {
    declare('hidden', { expose: false, auth: false })
    for (const name of ['hidden', 'nosuchworkflow']) {
      await assert.rejects(() => start(name, {}, alice), WorkflowNotFoundError)
    }
    await noRuns()
  })

  test('auth unset refuses an anonymous caller, like any function', async () => {
    declare('flow')
    await assert.rejects(
      () => start('flow', {}, anonymous),
      MissingSessionError
    )
    await noRuns()
  })

  test('auth: true refuses an anonymous caller', async () => {
    declare('flow', { auth: true })
    await assert.rejects(
      () => start('flow', {}, anonymous),
      MissingSessionError
    )
    await noRuns()
  })

  test('a missing scope refuses the caller', async () => {
    declare('flow', { scopes: ['orders:write'] })
    await assert.rejects(() => start('flow', {}, alice), MissingScopeError)
    await noRuns()
  })

  test('a permission refuses the caller, and sees the input', async () => {
    let seen: unknown
    declare('flow', {
      permissions: {
        no: async (_s, data) => {
          seen = data
          return false
        },
      },
    })
    await assert.rejects(
      () => start('flow', { quantity: 2 }, alice),
      ForbiddenError
    )
    assert.deepEqual(seen, { quantity: 2 })
    await noRuns()
  })

  test('input that breaks the declared schema is refused', async () => {
    declare('flow', { inputSchemaName: 'FlowInput', auth: false })
    await assert.rejects(
      () => start('flow', { quantity: 'two' }, anonymous),
      /quantity must be a number/
    )
    await noRuns()
  })

  test('a graph applies the same auth default', async () => {
    declareGraph('graph')
    await assert.rejects(
      () => start('graph', {}, anonymous),
      MissingSessionError
    )
    await noRuns()
  })

  test('a start passes the checks without running the body', async () => {
    declare('flow')
    await checkWorkflowStart('flow', {}, alice)
    assert.equal(bodyRuns, 0)
  })
})

describe('a route lets through what the workflow declares', () => {
  test('a signed-in caller becomes the owner', async () => {
    declare('flow')
    const { runId } = await start('flow', {}, alice)
    const run = await ws.getRun(runId)
    assert.equal(run?.wire?.pikkuUserId, 'alice')
    assert.equal(run?.status, 'completed')
  })

  test('auth: false starts an ownerless run for an anonymous caller', async () => {
    declare('flow', { auth: false })
    const { runId } = await start('flow', {}, anonymous)
    const run = await ws.getRun(runId)
    assert.equal(run?.wire?.pikkuUserId, undefined)
    assert.equal(run?.wire?.verified, undefined)
    assert.equal(run?.status, 'completed')
  })
})

describe('a signed-in run with no session store', () => {
  test('passes on the proof of its checked start', async () => {
    let permissionChecks = 0
    declare('flow', {
      auth: true,
      scopes: ['orders:write'],
      permissions: {
        allowed: async () => {
          permissionChecks += 1
          return true
        },
      },
    })
    const session = { userId: 'alice', scopes: ['orders:write'], org: 'acme' }
    const { runId } = await start('flow', {}, { session })
    assert.equal((await ws.getRun(runId))?.status, 'completed')
    assert.equal(permissionChecks, 1, 'judged at the start, not again')
  })

  test('the body reads the user id, and only that', async () => {
    declare('flow', { auth: true })
    await start('flow', {}, { session: { userId: 'alice', org: 'acme' } })
    assert.deepEqual(seenSession, { userId: 'alice' })
  })

  test('the run row holds no session data', async () => {
    declare('flow', { auth: true })
    const { runId } = await start(
      'flow',
      {},
      { session: { userId: 'alice', org: 'acme' } }
    )
    const stored = JSON.stringify((await ws.getRun(runId))?.wire)
    assert.ok(!stored.includes('acme'), stored)
  })

  test('a pikkuFunc step gets the same identity', async () => {
    declare('flow', { auth: true })
    const checked = await checkWorkflowStart('flow', {}, alice)
    const runId = await ws.createRun('flow', {}, false, 'hash', checked.wire)
    await ws.insertStepState(runId, 'step', 'stepOne', {})
    const stepState = await ws.getStepState(runId, 'step')
    let wire: any
    await (ws as any).invokeStepRpc(
      runId,
      'step',
      stepState,
      'stepOne',
      {},
      {
        rpcWithWire: async (_n: string, _d: unknown, w: unknown) => {
          wire = w
        },
      }
    )
    assert.deepEqual(wire.session, { userId: 'alice' })
  })

  test('a child of a proven run is proven, and its own gates still run', async () => {
    const { childRunWire, withRunProof, settleRunWire } =
      await import('./workflow-run-proof.js')
    const parent = settleRunWire(
      'parent',
      withRunProof({ type: 'http', pikkuUserId: 'alice' }, 'start', 'parent')
    )
    const child = settleRunWire(
      'child',
      childRunWire(parent, { type: 'workflow', pikkuUserId: 'alice' }, 'child')
    )
    assert.equal(child.verified, 'parent')

    declare('child', { scopes: ['orders:write'] })
    const runId = await ws.createRun(
      'child',
      {},
      true,
      'hash',
      childRunWire(parent, { type: 'workflow', pikkuUserId: 'alice' }, 'child')
    )
    ws.registerInlineRun(runId)
    await assert.rejects(
      () => ws.runWorkflowJob(runId, {} as any),
      MissingScopeError
    )
  })

  test('a store that no longer holds the session still refuses', async () => {
    useServices({ sessionStore: { get: async () => undefined } })
    declare('flow', { auth: true })
    await assert.rejects(() => start('flow', {}, alice), MissingSessionError)
    assert.equal(bodyRuns, 0)
  })

  test('a store that holds it supplies the real session', async () => {
    const stored = { userId: 'alice', org: 'acme' }
    useServices({ sessionStore: { get: async () => stored } })
    declare('flow', { auth: true })
    await start('flow', {}, alice)
    assert.deepEqual(seenSession, stored)
  })

  test('a function in another unit cannot be judged, so proves nothing', async () => {
    declare('flow', { auth: true, inThisUnit: false })
    const checked = await checkWorkflowStart('flow', {}, alice)
    const runId = await ws.createRun('flow', {}, false, 'hash', checked.wire)
    assert.equal((await ws.getRun(runId))?.wire?.verified, undefined)
  })
})

describe('the proof cannot be spoofed', () => {
  const internal = (wire: any = {}) =>
    rpcService.getContextRPCService(services as any, wire, {} as any, 0)

  test('rpc.startWorkflow cannot pass verified on its wire', async () => {
    declare('flow', { auth: true })
    await assert.rejects(
      () =>
        internal().startWorkflow('flow', {}, {
          wire: { type: 'http', pikkuUserId: 'alice', verified: 'start' },
          inline: true,
        } as any),
      MissingSessionError
    )
    assert.equal(bodyRuns, 0)
    const [run] = await ws.listRuns()
    assert.equal(run?.wire?.verified, undefined)
  })

  test('createRun drops a verified it was handed', async () => {
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'http',
      pikkuUserId: 'alice',
      verified: 'start',
    })
    assert.equal((await ws.getRun(runId))?.wire?.verified, undefined)
  })

  test('a wire that went through JSON has lost its proof', async () => {
    declare('flow')
    const checked = await checkWorkflowStart('flow', {}, alice)
    const runId = await ws.createRun(
      'flow',
      {},
      false,
      'hash',
      JSON.parse(JSON.stringify(checked.wire))
    )
    assert.equal((await ws.getRun(runId))?.wire?.verified, undefined)
  })

  test('a checked start for one workflow proves nothing for another', async () => {
    declare('flow')
    declare('other')
    const checked = await checkWorkflowStart('flow', {}, alice)
    const runId = await ws.createRun('other', {}, false, 'hash', checked.wire)
    assert.equal((await ws.getRun(runId))?.wire?.verified, undefined)
  })

  test('a checked start with no owner proves nothing', async () => {
    declare('flow', { auth: false })
    const checked = await checkWorkflowStart('flow', {}, anonymous)
    const runId = await ws.createRun('flow', {}, false, 'hash', checked.wire)
    assert.equal((await ws.getRun(runId))?.wire?.verified, undefined)
  })
})

describe('internal starts are unchanged', () => {
  test('rpc.startWorkflow reaches a hidden workflow', async () => {
    declare('hidden', { expose: false, auth: false })
    const rpc = rpcService.getContextRPCService(
      services as any,
      {} as any,
      {} as any,
      0
    )
    const { runId } = await rpc.startWorkflow('hidden', {}, {
      inline: true,
    } as any)
    assert.equal((await ws.getRun(runId))?.status, 'completed')
  })

  test('with no user, auth unset refuses in the body and auth: false runs', async () => {
    declare('needsUser')
    declare('scheduled', { auth: false })
    await assert.rejects(
      () =>
        ws.startWorkflow('needsUser', {}, { type: 'scheduler' }, {} as any, {
          inline: true,
        }),
      MissingSessionError
    )
    const { runId } = await ws.startWorkflow(
      'scheduled',
      {},
      { type: 'scheduler' },
      {} as any,
      { inline: true }
    )
    assert.equal((await ws.getRun(runId))?.status, 'completed')
  })

  test('a graph with auth unset needs an owner the store can load', async () => {
    declareGraph('graph')
    await assert.rejects(
      () => ws.startWorkflow('graph', {}, { type: 'scheduler' }, {} as any),
      MissingSessionError
    )
    await assert.rejects(
      () =>
        ws.startWorkflow(
          'graph',
          {},
          { type: 'http', pikkuUserId: 'alice' },
          {} as any
        ),
      MissingSessionError
    )
    await noRuns()
  })

  test('approveStep with no session still answers an owner-gated, ownerless run', async () => {
    useServices({ queueService: { add: async () => 'job-1' } })
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'trigger',
    })
    await assert.doesNotReject(() =>
      ws.approveStep(runId, 'gate', { ok: true })
    )
  })
})

describe('a workflow called as an exposed RPC', () => {
  const exposedRpc = (wire: any) => {
    const callerWire = { ...wire }
    return rpcService.getContextRPCService(
      services as any,
      callerWire,
      {} as any,
      0
    ).exposed
  }
  const publish = (name: string, declaration: Declaration) => {
    declare(name, declaration)
    pikkuState(null, 'function', 'meta')[name]!.expose = true
  }

  test('runs the declared auth: unset refuses an anonymous caller', async () => {
    publish('flow', {})
    await assert.rejects(
      () => exposedRpc(anonymous)('flow', {}),
      MissingSessionError
    )
    assert.equal(bodyRuns, 0)
  })

  test('runs the declared scopes and permissions', async () => {
    publish('scoped', { scopes: ['orders:write'] })
    publish('denied', { permissions: { no: async () => false } })
    await assert.rejects(
      () => exposedRpc(alice)('scoped', {}),
      MissingScopeError
    )
    await assert.rejects(() => exposedRpc(alice)('denied', {}), ForbiddenError)
    assert.equal(bodyRuns, 0)
  })

  test('auth: false reaches the body anonymously, as it declares', async () => {
    publish('open', { auth: false })
    await exposedRpc(anonymous)('open', {})
    assert.equal(bodyRuns, 1)
  })

  test('the call is not a run: the body has no workflow context', async () => {
    let seenWorkflow: unknown = 'unset'
    publish('flow', { auth: false })
    pikkuState(null, 'function', 'functions').get('flow')!.func = async (
      _s: unknown,
      _d: unknown,
      wire: any
    ) => {
      seenWorkflow = wire.workflow
    }
    await exposedRpc(anonymous)('flow', {})
    assert.equal(seenWorkflow, undefined)
    await noRuns()
  })
})

describe('reading a run', () => {
  const run = (over: Record<string, unknown> = {}) =>
    ({
      workflow: 'flow',
      input: { orderId: 'o1' },
      wire: { type: 'http', pikkuUserId: 'alice' },
      ...over,
    }) as any
  const ownerless = run({ wire: { type: 'trigger' } })
  const read = (target: any, wire: any, name = 'flow') =>
    checkWorkflowRunAccess(name, target, wire, 'read')
  const bob = { session: { userId: 'bob' } } as any

  test('a hidden workflow, a missing run and a foreign run are all a 404', async () => {
    declare('flow')
    declare('hidden', { expose: false })
    await assert.rejects(
      () => read(run(), alice, 'hidden'),
      WorkflowNotFoundError
    )
    await assert.rejects(() => read(null, alice), WorkflowNotFoundError)
    await assert.rejects(
      () => read(run({ workflow: 'other' }), alice),
      WorkflowNotFoundError
    )
  })

  test('a run with an owner is for that owner', async () => {
    declare('flow')
    await assert.doesNotReject(() => read(run(), alice))
    await assert.rejects(() => read(run(), bob), WorkflowRunForbiddenError)
  })

  test('auth: false does not open a run that has an owner', async () => {
    declare('flow', { auth: false })
    await assert.rejects(
      () => read(run(), anonymous),
      WorkflowRunForbiddenError
    )
  })

  test('auth unset refuses an anonymous reader', async () => {
    declare('flow')
    await assert.rejects(() => read(run(), anonymous), MissingSessionError)
  })

  test('an ownerless run on an auth workflow is refused', async () => {
    declare('flow')
    await assert.rejects(
      () => read(ownerless, alice),
      WorkflowRunForbiddenError
    )
  })

  test('an ownerless run is readable where the workflow is auth: false', async () => {
    declare('flow', { auth: false })
    await assert.doesNotReject(() => read(ownerless, anonymous))
  })

  test('permissions can open an ownerless run, judged on its stored input', async () => {
    const seen: unknown[] = []
    declare('flow', {
      permissions: {
        sameOrder: async (_s, data, wire) => {
          seen.push(data)
          return wire.session?.userId === 'alice'
        },
      },
    })
    await assert.doesNotReject(() => read(ownerless, alice))
    assert.deepEqual(seen, [{ orderId: 'o1' }])
    await assert.rejects(() => read(ownerless, bob), ForbiddenError)
  })

  test('permissions refuse the owner too', async () => {
    declare('flow', { permissions: { no: async () => false } })
    await assert.rejects(() => read(run(), alice), ForbiddenError)
  })

  test('a read does not need a schema-valid input or a writable session', async () => {
    declare('flow', { inputSchemaName: 'FlowInput' })
    await assert.doesNotReject(() =>
      read(run(), { session: { userId: 'alice', readonly: true } })
    )
  })
})

describe('answering a run', () => {
  const run = {
    workflow: 'flow',
    input: {},
    wire: { type: 'http', pikkuUserId: 'alice' },
  } as any
  const approve = (target: any, wire: any, name = 'flow') =>
    checkWorkflowRunAccess(name, target, wire, 'approve')

  test('the URL names the workflow: a run of another is a 404', async () => {
    declare('flow')
    declare('other')
    await assert.rejects(
      () => approve(run, alice, 'other'),
      WorkflowNotFoundError
    )
  })

  test('a hidden workflow is a 404', async () => {
    declare('flow', { expose: false })
    await assert.rejects(() => approve(run, alice), WorkflowNotFoundError)
  })

  test('a session is required even on an auth: false workflow', async () => {
    declare('flow', { auth: false })
    await assert.rejects(() => approve(run, anonymous), MissingSessionError)
  })

  test('the owner rule does not apply: approvers decides', async () => {
    declare('flow')
    await assert.doesNotReject(() =>
      approve(run, { session: { userId: 'bob' } })
    )
  })

  test('the workflow permissions apply', async () => {
    declare('flow', { permissions: { no: async () => false } })
    await assert.rejects(() => approve(run, alice), ForbiddenError)
  })
})
