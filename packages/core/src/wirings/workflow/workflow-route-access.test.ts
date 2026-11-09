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
import { InMemorySessionStore } from '../../services/in-memory-session-store.js'
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
let sessionStore: InMemorySessionStore

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
  services = { logger, schema, workflowService: ws, sessionStore, ...extra }
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
  sessionStore = new InMemorySessionStore()
  void sessionStore.set('alice', { userId: 'alice' })
  useServices()
  addSchema('FlowInput', { type: 'object' })
})

describe('a route refuses a start at the request, leaving no run', () => {
  test('a workflow that does not exist is a 404', async () => {
    await assert.rejects(
      () => start('nosuchworkflow', {}, alice),
      WorkflowNotFoundError
    )
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
    assert.equal(run?.status, 'completed')
  })
})

const sessionsFor = (held: Record<string, unknown>) =>
  useServices({ sessionStore: { get: async (id: string) => held[id] } })

describe('a run loads its owner session every time it executes', () => {
  test('the body sees the stored session, not the caller one', async () => {
    const stored = { userId: 'alice', org: 'acme' }
    sessionsFor({ alice: stored })
    declare('flow', { auth: true })
    await start('flow', {}, alice)
    assert.deepEqual(seenSession, stored)
  })

  test('the run row holds the user id and no session data', async () => {
    sessionsFor({ alice: { userId: 'alice', org: 'acme' } })
    declare('flow', { auth: true })
    const { runId } = await start(
      'flow',
      {},
      { session: { userId: 'alice', org: 'acme' } }
    )
    const stored = JSON.stringify((await ws.getRun(runId))?.wire)
    assert.ok(!stored.includes('acme'), stored)
    assert.equal((await ws.getRun(runId))?.wire?.pikkuUserId, 'alice')
  })

  test('with no session store a run that needs a session is refused', async () => {
    useServices({ sessionStore: undefined })
    declare('flow', { auth: true })
    await assert.rejects(
      () => start('flow', {}, alice),
      /require a sessionStore/
    )
    assert.equal(bodyRuns, 0)
  })

  test('with no session store an auth: false run still runs', async () => {
    useServices({ sessionStore: undefined })
    declare('flow', { auth: false })
    const { runId } = await start('flow', {}, anonymous)
    assert.equal((await ws.getRun(runId))?.status, 'completed')
  })

  test('a store that no longer holds the session refuses', async () => {
    sessionsFor({})
    declare('flow', { auth: true })
    await assert.rejects(() => start('flow', {}, alice), MissingSessionError)
    assert.equal(bodyRuns, 0)
  })

  test('a permission revoked after the start refuses the run next execution', async () => {
    let allowed = true
    let checks = 0
    sessionsFor({ alice: { userId: 'alice' } })
    declare('flow', {
      auth: true,
      permissions: {
        allowed: async () => {
          checks += 1
          return allowed
        },
      },
    })
    const checked = await checkWorkflowStart('flow', {}, alice)
    assert.equal(checks, 1, 'judged at the start')
    const first = await ws.createRun('flow', {}, true, 'hash', checked.wire)
    const second = await ws.createRun('flow', {}, true, 'hash', checked.wire)

    ws.registerInlineRun(first)
    await ws.runWorkflowJob(first, {} as any)
    assert.equal(checks, 2, 'judged again when the run executed')
    assert.equal(bodyRuns, 1)

    allowed = false
    ws.registerInlineRun(second)
    await assert.rejects(
      () => ws.runWorkflowJob(second, {} as any),
      ForbiddenError
    )
    assert.equal(bodyRuns, 1, 'the revoked run never reached its body')
  })

  test('scopes revoked from the stored session refuse the next execution', async () => {
    const held: Record<string, unknown> = {
      alice: { userId: 'alice', scopes: ['orders:write'] },
    }
    sessionsFor(held)
    declare('flow', { auth: true, scopes: ['orders:write'] })
    const checked = await checkWorkflowStart('flow', {}, {
      session: held.alice,
    } as any)
    const runId = await ws.createRun('flow', {}, true, 'hash', checked.wire)
    held.alice = { userId: 'alice', scopes: [] }
    ws.registerInlineRun(runId)
    await assert.rejects(
      () => ws.runWorkflowJob(runId, {} as any),
      MissingScopeError
    )
  })

  test('a pikkuFunc step carries the user id and loads the session itself', async () => {
    sessionsFor({ alice: { userId: 'alice' } })
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
    assert.equal(wire.pikkuUserId, 'alice')
    assert.equal(wire.session, undefined)
  })

  test('a child run is judged against its own gates', async () => {
    sessionsFor({ alice: { userId: 'alice' } })
    declare('child', { scopes: ['orders:write'] })
    const runId = await ws.createRun('child', {}, true, 'hash', {
      type: 'workflow',
      pikkuUserId: 'alice',
    })
    ws.registerInlineRun(runId)
    await assert.rejects(
      () => ws.runWorkflowJob(runId, {} as any),
      MissingScopeError
    )
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
          { type: 'http', pikkuUserId: 'bob' },
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

  test('an unknown workflow, a missing run and a foreign run are all a 404', async () => {
    declare('flow')
    await assert.rejects(
      () => read(run(), alice, 'nosuchworkflow'),
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

describe('rpc.exposedWorkflow is the external entry for a workflow', () => {
  const entry = (wire: any, channel?: any) =>
    rpcService.getContextRPCService(
      services as any,
      { ...wire, ...(channel ? { channel } : {}) },
      {} as any,
      0
    ).exposedWorkflow
  const internal = () =>
    rpcService.getContextRPCService(services as any, {} as any, {} as any, 0)
  const channel = () => {
    const sent: unknown[] = []
    return {
      sent,
      send: async (message: unknown) => void sent.push(message),
      close: async () => {},
    }
  }
  const run = {
    workflow: 'hidden',
    input: {},
    wire: { type: 'http', pikkuUserId: 'alice' },
  }

  test('a workflow that is not exposed is a 404 on every call, leaving no run', async () => {
    declare('hidden', { expose: false, auth: false })
    const sink = channel()
    const rpc = entry(alice, sink)
    const calls = {
      start: () => rpc.start('hidden', {}),
      run: () => rpc.run('hidden', {}),
      status: () => rpc.status('hidden', 'r1'),
      approve: () => rpc.approve('hidden', 'r1', 'gate', { ok: true }),
      streamStatus: () => rpc.streamStatus('hidden', 'r1'),
      streamStatusFull: () => rpc.streamStatusFull('hidden', 'r1'),
    }
    for (const [name, call] of Object.entries(calls)) {
      await assert.rejects(call, WorkflowNotFoundError, name)
    }
    assert.deepEqual(sink.sent, [])
    await noRuns()
  })

  test('an unexposed workflow answers like one that does not exist', async () => {
    declare('hidden', { expose: false, auth: false })
    const message = async (name: string) => {
      try {
        await entry(alice).start(name, {})
      } catch (error) {
        return (error as Error).message.replace(name, '<name>')
      }
    }
    assert.equal(await message('hidden'), await message('nosuchworkflow'))
  })

  test('a hidden workflow with a real run is not readable or answerable', async () => {
    declare('hidden', { expose: false, auth: false })
    const runId = await ws.createRun('hidden', {}, false, 'hash', run.wire)
    await assert.rejects(
      () => entry(alice).status('hidden', runId),
      WorkflowNotFoundError
    )
    await assert.rejects(
      () => entry(alice).approve('hidden', runId, 'gate', {}),
      WorkflowNotFoundError
    )
  })

  test('an exposed workflow starts, and its own declaration still decides', async () => {
    declare('flow', { auth: true })
    await assert.rejects(
      () => entry(anonymous).start('flow', {}),
      MissingSessionError
    )
    await noRuns()
    const { runId } = await entry(alice).start('flow', {})
    assert.equal((await ws.getRun(runId))?.wire?.pikkuUserId, 'alice')
  })

  test('an exposed workflow runs to completion', async () => {
    declare('flow', { auth: true })
    assert.equal(await entry(alice).run('flow', {}), 'done')
  })

  test('an exposed workflow reports the status of its own run', async () => {
    declare('flow', { auth: true })
    const { runId } = await entry(alice).start('flow', {})
    const status = await entry(alice).status('flow', runId)
    assert.equal(status.status, 'completed')
    await assert.rejects(
      () => entry({ session: { userId: 'bob' } }).status('flow', runId),
      WorkflowRunForbiddenError
    )
  })

  test('an exposed workflow streams its own run', async () => {
    declare('flow', { auth: true })
    useServices({ workflowRunService: ws })
    const { runId } = await entry(alice).start('flow', {})
    const sink = channel()
    await entry(alice, sink).streamStatus('flow', runId)
    assert.ok(sink.sent.length > 0)
  })

  test('rpc.startWorkflow still reaches a workflow that is not exposed', async () => {
    declare('hidden', { expose: false, auth: false })
    const { runId } = await internal().startWorkflow('hidden', {}, {
      inline: true,
    } as any)
    assert.equal((await ws.getRun(runId))?.status, 'completed')
  })
})
