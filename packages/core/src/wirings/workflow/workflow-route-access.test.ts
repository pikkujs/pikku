import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { MissingSessionError } from '../../errors/errors.js'
import {
  pikkuState,
  resetPikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import { addSchema } from '../../schema.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { WorkflowNotFoundError } from './workflow-errors.js'
import {
  assertWorkflowRunAnswerable,
  assertWorkflowRunReadable,
  prepareWorkflowRouteStart,
  WorkflowRunForbiddenError,
} from './workflow-run-ownership.js'
import type { WorkflowRuntimeMeta } from './workflow.types.js'

const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as any

const schema = {
  compileSchema: async () => {},
  validateSchema: async (_key: string, data: any) => {
    if (typeof data.quantity !== 'number') {
      throw new Error('quantity must be a number')
    }
  },
} as any

const services = { logger, schema }

const meta = (over: Partial<WorkflowRuntimeMeta>): WorkflowRuntimeMeta => ({
  name: 'flow',
  pikkuFuncId: 'flow',
  source: 'dsl',
  ...over,
})

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'workflows', 'meta', {
    hidden: meta({ name: 'hidden' }),
    signedIn: meta({ name: 'signedIn', expose: true }),
    signedInExplicit: meta({
      name: 'signedInExplicit',
      expose: true,
      auth: true,
    }),
    anonymousHidden: meta({ name: 'anonymousHidden', auth: false }),
    open: meta({
      name: 'open',
      expose: true,
      auth: false,
      inputSchemaName: 'OpenInput',
    }),
  })
  addSchema('OpenInput', { type: 'object' })
})

describe('the start routes', () => {
  for (const name of ['hidden', 'anonymousHidden', 'nosuchworkflow']) {
    test(`a signed-in caller cannot start '${name}'`, async () => {
      await assert.rejects(
        () => prepareWorkflowRouteStart(services, name, {}, 'session'),
        WorkflowNotFoundError
      )
    })
  }

  for (const name of [
    'hidden',
    'anonymousHidden',
    'signedIn',
    'signedInExplicit',
    'nosuchworkflow',
  ]) {
    test(`an anonymous caller cannot start '${name}'`, async () => {
      await assert.rejects(
        () => prepareWorkflowRouteStart(services, name, {}, 'anonymous'),
        MissingSessionError
      )
    })
  }

  test('an exposed workflow starts with a session', async () => {
    assert.deepEqual(
      await prepareWorkflowRouteStart(
        services,
        'signedIn',
        { a: 1 },
        'session'
      ),
      { a: 1 }
    )
  })

  test('expose: true with auth: false starts anonymously', async () => {
    assert.deepEqual(
      await prepareWorkflowRouteStart(
        services,
        'open',
        { quantity: 1 },
        'anonymous'
      ),
      { quantity: 1 }
    )
  })

  for (const access of ['session', 'anonymous'] as const) {
    test(`input that breaks the declared schema is refused (${access})`, async () => {
      await assert.rejects(
        () =>
          prepareWorkflowRouteStart(
            services,
            'open',
            { quantity: 'many' },
            access
          ),
        /quantity must be a number/
      )
    })
  }

  test('a declared schema with no schema service is refused, not skipped', async () => {
    await assert.rejects(
      () =>
        prepareWorkflowRouteStart(
          { logger },
          'open',
          { quantity: 1 },
          'session'
        ),
      /schema service is required/
    )
  })
})

describe('the status routes', () => {
  const session = { userId: 'user-a' }
  const owned = {
    workflow: 'flow',
    wire: { type: 'http', pikkuUserId: 'user-a' },
  }

  test('the owner reads their own run', () => {
    assert.doesNotThrow(() => assertWorkflowRunReadable(owned, 'flow', session))
  })

  const refused: Array<[string, any, string, any]> = [
    ['a missing run', null, 'flow', session],
    ['a run of another workflow', owned, 'other', session],
    ['another user', owned, 'flow', { userId: 'user-b' }],
    ['no session', owned, 'flow', undefined],
    [
      'an ownerless run',
      { workflow: 'flow', wire: { type: 'trigger' } },
      'flow',
      session,
    ],
  ]
  for (const [label, run, name, caller] of refused) {
    test(`refuses ${label}`, () => {
      assert.throws(
        () => assertWorkflowRunReadable(run, name, caller),
        WorkflowRunForbiddenError
      )
    })
  }
})

describe('the approve route', () => {
  test('answers a run of an exposed workflow', () => {
    assert.doesNotThrow(() =>
      assertWorkflowRunAnswerable({ workflow: 'signedIn' }, 'signedIn')
    )
  })

  const refused: Array<[string, any, string]> = [
    ['a hidden workflow', { workflow: 'hidden' }, 'hidden'],
    ['a hidden run under an exposed name', { workflow: 'hidden' }, 'signedIn'],
    ['a missing run', null, 'signedIn'],
    ['an unknown workflow', { workflow: 'nope' }, 'nope'],
  ]
  for (const [label, run, name] of refused) {
    test(`refuses ${label}`, () => {
      assert.throws(
        () => assertWorkflowRunAnswerable(run, name),
        WorkflowNotFoundError
      )
    })
  }
})

describe('internal callers keep working', () => {
  test('a hidden workflow has no route gate on rpc.startWorkflow, whose only check is that it exists', async () => {
    const ws = new InMemoryWorkflowService()
    await assert.rejects(
      () =>
        ws.startWorkflow('nosuchworkflow', {}, { type: 'internal' }, {} as any),
      WorkflowNotFoundError
    )
  })

  test('approveStep with no session still answers an owner-gated, ownerless run', async () => {
    setSingletonServices({
      logger,
      queueService: { add: async () => 'job-1' },
    } as any)
    const ws = new InMemoryWorkflowService()
    const runId = await ws.createRun('flow', {}, false, 'hash', {
      type: 'trigger',
    })
    await assert.doesNotReject(() =>
      ws.approveStep(runId, 'gate', { ok: true })
    )
  })
})
