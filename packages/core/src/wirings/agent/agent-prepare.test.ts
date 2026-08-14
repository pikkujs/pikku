import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  CREDENTIAL_REQUIRED,
  agentSessionScope,
  assertResourceOwner,
  assertResourcePrincipalOwner,
  canAccessThread,
  buildInstructions,
  buildSubAgentRunInput,
  buildToolDefs,
  createScopedChannel,
  getAddonCredentialRequirements,
  isOwnedByPrincipal,
  resolveAgent,
  resolveOwnerResourceId,
  sessionPrincipals,
  threadOwnerConstraint,
} from './agent-prepare.js'
import { ForbiddenError, MissingCredentialError } from '../../errors/errors.js'
import { pikkuAuth } from '../../function/functions.types.js'
import type {
  AgentStreamChannel,
  AgentStreamEvent,
  CoreAgent,
  PikkuAgentMiddlewareHooks,
} from './agent.types.js'

beforeEach(() => {
  resetPikkuState()
})

const addAgent = (agentName: string, overrides: Partial<CoreAgent> = {}) => {
  const agent: CoreAgent = {
    name: agentName,
    description: `${agentName} description`,
    goal: `${agentName} goal`,
    instructions: `${agentName} instructions`,
    model: 'test/test-model',
    ...overrides,
  }

  pikkuState(null, 'agent', 'agents').set(agentName, agent)
  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  } as any
}

describe('agent-prepare', () => {
  test('getAddonCredentialRequirements returns deduplicated wire oauth credentials', () => {
    pikkuState(null, 'addons', 'packages').set('github', {
      package: '@test/github-addon',
    })
    pikkuState('@test/github-addon', 'package', 'credentialsMeta', {
      githubAuth: {
        type: 'wire',
        oauth2: true,
        displayName: 'GitHub OAuth',
      },
      apiKey: {
        type: 'wire',
        oauth2: false,
      },
    })

    const requirements = getAddonCredentialRequirements([
      'github:getProfile',
      'github:listRepos',
      'localTool',
    ])

    assert.deepEqual(requirements, [
      {
        credentialName: 'githubAuth',
        displayName: 'GitHub OAuth',
        addonNamespace: 'github',
        type: 'wire',
        oauth2: true,
      },
    ])
  })

  test('resolveAgent resolves root and addon agents and rejects missing names', () => {
    addAgent('root-agent')

    const addonAgent: CoreAgent = {
      name: 'addon-agent',
      description: 'addon',
      goal: 'addon goal',
      instructions: 'addon instructions',
      model: 'test/test-model',
    }

    pikkuState(null, 'addons', 'packages').set('support', {
      package: '@test/support-addon',
    })
    pikkuState('@test/support-addon', 'agent', 'agents').set(
      'helper',
      addonAgent
    )

    assert.equal(resolveAgent('root-agent').packageName, null)
    assert.equal(resolveAgent('root-agent').resolvedName, 'root-agent')
    assert.equal(
      resolveAgent('support:helper').packageName,
      '@test/support-addon'
    )
    assert.equal(resolveAgent('support:helper').resolvedName, 'helper')
    assert.throws(() => resolveAgent(''), {
      message: 'resolveAgent called with undefined agentName',
    })
    assert.throws(() => resolveAgent('missing-agent'), {
      message: 'AI agent not found: missing-agent',
    })
  })

  test('buildInstructions includes tool and sub-agent guidance when configured', async () => {
    addAgent('planner', {
      role: 'You are a planner.',
      personality: 'Be concise.',
      goal: 'Finish the task.',
      tools: ['search'],
      agents: ['coder'],
    })

    const instructions = await buildInstructions('planner', null)
    assert.match(instructions, /You are a planner\./)
    assert.match(instructions, /Be concise\./)
    assert.match(instructions, /Finish the task\./)
    assert.match(instructions, /Tool usage rules:/)
    assert.match(instructions, /When calling a sub-agent/)
  })

  test('buildInstructions joins role, personality and goal in order, blank-line separated', async () => {
    addAgent('scribe', {
      role: 'ROLE',
      personality: 'PERSONALITY',
      goal: 'GOAL',
    })

    const instructions = await buildInstructions('scribe', null)
    assert.equal(instructions, 'ROLE\n\nPERSONALITY\n\nGOAL')
  })

  test('buildInstructions omits missing sections rather than leaving blank gaps', async () => {
    addAgent('terse', { role: 'ROLE', goal: 'GOAL' })

    const instructions = await buildInstructions('terse', null)
    assert.equal(instructions, 'ROLE\n\nGOAL')
  })

  test('buildInstructions adds no tool or sub-agent guidance when none are configured', async () => {
    addAgent('bare', { role: 'ROLE', goal: undefined })

    const instructions = await buildInstructions('bare', null)
    assert.equal(instructions, 'ROLE')
    assert.doesNotMatch(instructions, /Tool usage rules:/)
    assert.doesNotMatch(instructions, /When calling a sub-agent/)
  })

  test('createScopedChannel forwards stream events, captures approvals, and suppresses done', () => {
    const events: AgentStreamEvent[] = []
    const channel = createScopedChannel(
      {
        channelId: 'root',
        openingData: undefined,
        state: 'open',
        send: (event: AgentStreamEvent) => {
          events.push(event)
        },
        sendBinary: () => {},
        close: () => {},
        setState: () => {},
        getState: () => 'open',
        clearState: () => {},
      } as AgentStreamChannel,
      'sub-agent',
      'session-1'
    )

    channel.send({ type: 'text-delta', text: 'hello' } as AgentStreamEvent)
    channel.send({
      type: 'approval-request',
      toolCallId: 'tc-1',
      toolName: 'tool-a',
      args: { x: 1 },
      reason: 'Delete todo "x"',
      runId: 'run-1',
    } as AgentStreamEvent)
    channel.send({ type: 'done' } as AgentStreamEvent)

    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'text-delta')
    assert.deepEqual(channel.approvals, [
      {
        toolCallId: 'tc-1',
        toolName: 'tool-a',
        args: { x: 1 },
        reason: 'Delete todo "x"',
        runId: 'run-1',
      },
    ])
    assert.equal(channel.channelId, 'root:sub-agent:session-1')
  })

  test('buildToolDefs reports missing RPCs, builds approval descriptions, and wraps tool hooks', async () => {
    addAgent('ops-agent')
    pikkuState(null, 'agent', 'agentsMeta')['ops-agent'] = {
      ...pikkuState(null, 'agent', 'agentsMeta')['ops-agent'],
      tools: ['missingTool', 'deploy'],
    } as any
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy the service',
      approvalRequired: true,
      inputSchemaName: 'DeployInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
    })
    pikkuState(null, 'function', 'functions').set('deploy', {
      func: async (_services: any, input: any) => `ok:${JSON.stringify(input)}`,
      approvalDescription: async (_services: any, input: any) =>
        `Deploy ${input.env}`,
    })

    const beforeCalls: unknown[] = []
    const afterCalls: unknown[] = []
    const middlewares: PikkuAgentMiddlewareHooks[] = [
      {
        beforeToolCall: async (_services, ctx) => {
          beforeCalls.push(ctx)
          return { args: { ...(ctx.args as any), extra: true } }
        },
        afterToolCall: async (_services, ctx) => {
          afterCalls.push(ctx)
          return { result: `wrapped:${String(ctx.result)}` }
        },
      },
    ]

    const singletonServices = {
      logger: {
        warn: () => {},
      },
    } as any
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const { tools, missingRpcs } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'ops-agent',
      null,
      undefined,
      middlewares
    )

    assert.deepEqual(missingRpcs, ['missingTool'])
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'deploy')
    assert.equal(tools[0].needsApproval, true)
    assert.deepEqual(tools[0].inputSchema, { type: 'object', properties: {} })
    assert.equal(
      await tools[0].approvalDescriptionFn?.({ env: 'prod' }),
      'Deploy prod'
    )

    const result = await tools[0].execute({ env: 'prod' })
    assert.equal(result, 'wrapped:ok:{"env":"prod","extra":true}')
    assert.equal(beforeCalls.length, 1)
    assert.equal(afterCalls.length, 1)
  })

  test('buildToolDefs resolves addon-scoped services for approvalDescription on a cold services cache', async () => {
    addAgent('todo-agent')
    pikkuState(null, 'agent', 'agentsMeta')['todo-agent'] = {
      ...pikkuState(null, 'agent', 'agentsMeta')['todo-agent'],
      tools: ['todos:deleteTodo'],
    } as any
    pikkuState(null, 'addons', 'packages').set('todos', {
      package: '@test/todos-addon',
    })
    pikkuState('@test/todos-addon', 'function', 'meta').deleteTodo = {
      description: 'Deletes a todo by ID',
      approvalRequired: true,
      inputSchemaName: 'DeleteTodoInput',
      sessionless: true,
    } as any
    pikkuState('@test/todos-addon', 'misc', 'schemas').set('DeleteTodoInput', {
      type: 'object',
    })
    pikkuState('@test/todos-addon', 'function', 'functions').set('deleteTodo', {
      func: async ({ todoStore }: any, { id }: any) => todoStore.delete(id),
      approvalDescription: async ({ todoStore }: any, { id }: any) =>
        `Delete the todo called "${todoStore.get(id)?.title ?? id}"`,
    })

    pikkuState('@test/todos-addon', 'package', 'factories', {
      createSingletonServices: async () => ({
        todoStore: {
          get: (id: string) =>
            id === '1' ? { id: '1', title: 'Buy groceries' } : undefined,
          delete: () => true,
        },
      }),
    } as any)

    const singletonServices = {
      logger: { warn: () => {} },
    } as any
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const { tools } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'todo-agent',
      null
    )

    assert.equal(tools.length, 1)
    assert.equal(tools[0].needsApproval, true)
    assert.equal(
      await tools[0].approvalDescriptionFn?.({ id: '1' }),
      'Delete the todo called "Buy groceries"'
    )
  })

  test('buildToolDefs logs a tool execute() failure even without agentMiddleware hooks, then rethrows', async () => {
    addAgent('ops-agent')
    pikkuState(null, 'agent', 'agentsMeta')['ops-agent'] = {
      ...pikkuState(null, 'agent', 'agentsMeta')['ops-agent'],
      tools: ['searchInventory'],
    } as any
    pikkuState(null, 'rpc', 'meta').searchInventory = 'searchInventory'
    pikkuState(null, 'function', 'meta').searchInventory = {
      description: 'Search inventory',
      inputSchemaName: 'SearchInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('SearchInput', { type: 'object' })
    pikkuState(null, 'function', 'functions').set('searchInventory', {
      func: async () => {
        throw new Error('db unreachable')
      },
    })

    const errorCalls: unknown[][] = []
    const singletonServices = {
      logger: {
        warn: () => {},
        error: (...args: unknown[]) => errorCalls.push(args),
      },
    } as any
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const { tools } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'ops-agent',
      null
    )

    assert.equal(tools.length, 1)
    await assert.rejects(() => tools[0].execute({}), /db unreachable/)
    assert.equal(errorCalls.length, 1)
    assert.match(String(errorCalls[0][0]), /searchInventory.*execute/)
  })

  test('buildToolDefs turns a MissingCredentialError into a Symbol-branded credential result', async () => {
    addAgent('creds-agent')
    pikkuState(null, 'agent', 'agentsMeta')['creds-agent'] = {
      ...pikkuState(null, 'agent', 'agentsMeta')['creds-agent'],
      tools: ['listRepos'],
    } as any
    pikkuState(null, 'rpc', 'meta').listRepos = 'listRepos'
    pikkuState(null, 'function', 'meta').listRepos = {
      description: 'List repos',
      inputSchemaName: 'ListReposInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('ListReposInput', {
      type: 'object',
    })
    pikkuState(null, 'function', 'functions').set('listRepos', {
      func: async () => {
        throw new MissingCredentialError('github', 'oauth2', '/connect/github')
      },
    })

    pikkuState(null, 'package', 'singletonServices', {
      logger: { warn: () => {}, error: () => {} },
    } as any)

    const { tools } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'creds-agent',
      null
    )

    assert.equal(tools.length, 1)
    const result = (await tools[0].execute({})) as Record<string | symbol, any>

    assert.equal(
      result[CREDENTIAL_REQUIRED],
      true,
      'the producer must stamp the non-forgeable brand'
    )
    assert.equal(result.__credentialRequired, true)
    assert.equal(result.credentialName, 'github')
    assert.equal(result.credentialType, 'oauth2')
    assert.equal(result.connectUrl, '/connect/github')
  })

  test('buildToolDefs skips permissioned tools without a session and adds sub-agent tools', async () => {
    addAgent('manager', {
      agents: ['assistant'],
    })
    addAgent('assistant', {
      description: 'Assistant agent',
    })

    pikkuState(null, 'agent', 'agentsMeta').manager = {
      ...pikkuState(null, 'agent', 'agentsMeta').manager,
      tools: ['secret-tool'],
      agents: ['assistant'],
    } as any
    pikkuState(null, 'rpc', 'meta')['secret-tool'] = 'secret-tool'
    pikkuState(null, 'function', 'meta')['secret-tool'] = {
      description: 'Secret tool',
      permissions: ['admin'],
      inputSchemaName: 'SecretInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('SecretInput', {
      type: 'object',
      properties: { id: { type: 'string' } },
    })

    const singletonServices = {
      logger: {
        warn: () => {},
      },
    } as any
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const { tools } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'manager',
      null
    )

    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'assistant')
    assert.deepEqual(tools[0].inputSchema, {
      type: 'object',
      properties: {
        message: { type: 'string' },
        session: {
          type: 'string',
          description: 'Short session label for thread continuity',
        },
      },
      required: ['message', 'session'],
    })
  })

  const addFilterAgent = (allow: boolean) => {
    addAgent('gatekeeper', { tools: ['gated'] })
    pikkuState(null, 'agent', 'agentsMeta').gatekeeper = {
      ...pikkuState(null, 'agent', 'agentsMeta').gatekeeper,
      tools: ['gated'],
    } as any
    pikkuState(null, 'rpc', 'meta').gated = 'gated'
    pikkuState(null, 'function', 'meta').gated = {
      description: 'Gated tool',
      permissions: [{ type: 'wire', name: 'mayUse' }],
      inputSchemaName: 'GatedInput',
      sessionless: true,
    } as any
    pikkuState(null, 'misc', 'schemas').set('GatedInput', {
      type: 'object',
      properties: {},
    })
    pikkuState(null, 'function', 'functions').set('gated', {
      func: async () => ({ ok: true }),
      permissions: { mayUse: pikkuAuth(async () => allow) },
    } as any)
    pikkuState(null, 'package', 'singletonServices', {
      logger: { warn: () => {}, debug: () => {} },
    } as any)
  }

  const sessionParams = () =>
    ({
      sessionService: { get: async () => ({ userId: 'u1' }) },
    }) as any

  test('buildToolDefs offers a tool whose live auth predicate passes', async () => {
    addFilterAgent(true)
    const { tools } = await buildToolDefs(
      sessionParams(),
      new Map<string, string>(),
      'resource-1',
      'gatekeeper',
      null
    )
    assert.deepEqual(
      tools.map((t) => t.name),
      ['gated']
    )
  })

  test('buildToolDefs filters out a tool whose live auth predicate fails', async () => {
    addFilterAgent(false)
    const { tools } = await buildToolDefs(
      sessionParams(),
      new Map<string, string>(),
      'resource-1',
      'gatekeeper',
      null
    )
    assert.deepEqual(tools, [])
  })

  test('buildToolDefs adds a workflow tool that runs the workflow and returns its output', async () => {
    addAgent('planner', { workflows: ['buildReport'] } as any)
    pikkuState(null, 'agent', 'agentsMeta').planner = {
      ...pikkuState(null, 'agent', 'agentsMeta').planner,
      workflows: ['buildReport'],
    } as any

    pikkuState(null, 'workflows', 'meta').buildReport = {
      name: 'buildReport',
      pikkuFuncId: 'buildReport',
      source: 'graph',
      description: 'Build a report for a country',
    } as any
    pikkuState(null, 'function', 'meta').buildReport = {
      inputSchemaName: 'BuildReportInput',
      sessionless: true,
    } as any
    pikkuState(null, 'misc', 'schemas').set('BuildReportInput', {
      type: 'object',
      properties: { country: { type: 'string' } },
      required: ['country'],
    })

    const runCalls: Array<{ name: string; input: unknown }> = []
    const workflowService = {
      runToCompletion: async (name: string, input: unknown) => {
        runCalls.push({ name, input })
        return { capital: 'Paris' }
      },
    }
    const singletonServices = {
      logger: { warn: () => {} },
      workflowService,
    } as any
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const { tools, missingRpcs } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'planner',
      null
    )

    assert.deepEqual(missingRpcs, [])
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'buildReport')
    assert.equal(tools[0].description, 'Build a report for a country')
    assert.deepEqual(tools[0].inputSchema, {
      type: 'object',
      properties: { country: { type: 'string' } },
      required: ['country'],
    })

    const result = await tools[0].execute({ country: 'France' })
    assert.deepEqual(result, { capital: 'Paris' })
    assert.deepEqual(runCalls, [
      { name: 'buildReport', input: { country: 'France' } },
    ])
  })

  test('buildToolDefs reports an unknown workflow tool as missing', async () => {
    addAgent('planner2', { workflows: ['ghost'] } as any)
    pikkuState(null, 'agent', 'agentsMeta').planner2 = {
      ...pikkuState(null, 'agent', 'agentsMeta').planner2,
      workflows: ['ghost'],
    } as any
    pikkuState(null, 'package', 'singletonServices', {
      logger: { warn: () => {} },
      workflowService: { runToCompletion: async () => ({}) },
    } as any)

    const { tools, missingRpcs } = await buildToolDefs(
      {},
      new Map<string, string>(),
      'resource-1',
      'planner2',
      null
    )

    assert.equal(tools.length, 0)
    assert.deepEqual(missingRpcs, ['ghost'])
  })
})

describe('C2 thread/run ownership + sessionScope', () => {
  const params = (session?: Record<string, unknown>) => ({
    sessionService: { get: () => session } as never,
  })

  test('user scope composes the trusted userId with the requested resourceId', () => {
    assert.equal(
      resolveOwnerResourceId(params({ userId: 'user-a' }), 'user', 'default'),
      'user-a:default'
    )
  })

  test('user scope is the default when sessionScope is undefined', () => {
    assert.equal(
      resolveOwnerResourceId(params({ userId: 'user-a' }), undefined, 'p1'),
      'user-a:p1'
    )
  })

  test('user scope sub-partitions within the owner (client resourceId regains meaning)', () => {
    assert.equal(
      resolveOwnerResourceId(params({ userId: 'alice' }), 'user', 'project-1'),
      'alice:project-1'
    )
    assert.equal(
      resolveOwnerResourceId(params({ userId: 'alice' }), 'user', 'project-2'),
      'alice:project-2'
    )
  })

  test('is idempotent: re-normalizing an already-owned key does not double-compose', () => {
    assert.equal(
      resolveOwnerResourceId(
        params({ userId: 'alice' }),
        'user',
        'alice:project-1'
      ),
      'alice:project-1'
    )
  })

  test('a client cannot forge another owner: a foreign prefix is re-scoped, not trusted', () => {
    assert.equal(
      resolveOwnerResourceId(params({ userId: 'bob' }), 'user', 'alice:secret'),
      'bob:alice:secret'
    )
  })

  test('a sessionless caller never owns the resourceId it asked for', () => {
    assert.notEqual(
      resolveOwnerResourceId({}, 'user', 'resource-1'),
      'resource-1'
    )
    assert.notEqual(
      resolveOwnerResourceId(params(undefined), 'user', 'resource-1'),
      'resource-1'
    )
  })

  test('a sessionless owner id is stable within a request and unique across requests', () => {
    const request = params(undefined)
    assert.equal(
      resolveOwnerResourceId(request, 'user', 'a'),
      resolveOwnerResourceId(request, 'user', 'b')
    )
    assert.notEqual(
      resolveOwnerResourceId(params(undefined), 'user', 'a'),
      resolveOwnerResourceId(params(undefined), 'user', 'a')
    )
  })

  test('a sessionless caller cannot claim an existing resource by replaying its owner id', () => {
    const owner = resolveOwnerResourceId(params(undefined), 'user', 'default')
    assert.notEqual(
      resolveOwnerResourceId(params(undefined), 'user', owner),
      owner
    )
  })

  test('assertResourcePrincipalOwner refuses every resource when there is no principal', () => {
    assert.throws(
      () =>
        assertResourcePrincipalOwner(
          params(undefined),
          'user',
          'resource-1',
          'run'
        ),
      (e: unknown) => e instanceof ForbiddenError
    )
    assert.throws(
      () => assertResourcePrincipalOwner({}, 'user', 'anon-abc', 'thread'),
      (e: unknown) => e instanceof ForbiddenError
    )
  })

  test('assertResourcePrincipalOwner admits the owning principal and refuses others', () => {
    assert.doesNotThrow(() =>
      assertResourcePrincipalOwner(
        params({ userId: 'alice' }),
        'user',
        'alice:default',
        'run'
      )
    )
    assert.throws(
      () =>
        assertResourcePrincipalOwner(
          params({ userId: 'bob' }),
          'user',
          'alice:default',
          'run'
        ),
      (e: unknown) => e instanceof ForbiddenError
    )
  })

  test('org scope composes the trusted orgId with the requested resourceId', () => {
    assert.equal(
      resolveOwnerResourceId(
        params({ userId: 'user-a', orgId: 'org-x' }),
        'org',
        'default'
      ),
      'org-x:default'
    )
  })

  test('org scope denies (ForbiddenError) when the session has no org', () => {
    assert.throws(
      () =>
        resolveOwnerResourceId(params({ userId: 'user-a' }), 'org', 'default'),
      (e: unknown) => e instanceof ForbiddenError
    )
    assert.throws(
      () => resolveOwnerResourceId({}, 'org', 'default'),
      (e: unknown) => e instanceof ForbiddenError
    )
  })

  test('assertResourceOwner throws ForbiddenError on an owner mismatch', () => {
    assert.throws(
      () => assertResourceOwner('user-a:d', 'user-b:d', 'thread'),
      (e: unknown) =>
        e instanceof ForbiddenError && !/user-a|user-b/.test(e.message)
    )
    assert.doesNotThrow(() =>
      assertResourceOwner('user-a:d', 'user-a:d', 'run')
    )
  })
})

describe('thread-read ownership (session principals)', () => {
  test('a principal owns its own bare key and any sub-partition of it', () => {
    assert.equal(isOwnedByPrincipal('alice', 'alice'), true)
    assert.equal(isOwnedByPrincipal('alice:project-1', 'alice'), true)
  })

  test('a principal does not own a lookalike prefix', () => {
    assert.equal(isOwnedByPrincipal('alice-evil:p', 'alice'), false)
    assert.equal(isOwnedByPrincipal('bob:alice:secret', 'alice'), false)
  })

  test('the caller may read a thread owned by their userId', () => {
    assert.equal(canAccessThread('alice:default', { userId: 'alice' }), true)
  })

  test('the caller may read a thread owned by their orgId', () => {
    assert.equal(
      canAccessThread('org-x:default', { userId: 'alice', orgId: 'org-x' }),
      true
    )
  })

  test('cross-user thread reads are refused', () => {
    assert.equal(canAccessThread('bob:secret', { userId: 'alice' }), false)
  })

  test('cross-org thread reads are refused', () => {
    assert.equal(
      canAccessThread('org-y:d', { userId: 'alice', orgId: 'org-x' }),
      false
    )
  })

  test('a forged owner prefix in the stored id cannot grant access', () => {
    assert.equal(
      canAccessThread('bob:alice:secret', { userId: 'alice' }),
      false
    )
  })

  test('a sessionless caller can read no thread at all', () => {
    assert.equal(canAccessThread('anything', undefined), false)
    assert.equal(canAccessThread('anything', {}), false)
    assert.equal(canAccessThread('anon-abc', undefined), false)
  })

  test('sessionPrincipals lists the userId and orgId a caller can read as', () => {
    assert.deepEqual(sessionPrincipals({ userId: 'alice', orgId: 'org-x' }), [
      'alice',
      'org-x',
    ])
    assert.deepEqual(sessionPrincipals({ userId: 'alice' }), ['alice'])
    assert.deepEqual(sessionPrincipals(undefined), [])
  })

  test('threadOwnerConstraint scopes a session to its principals', () => {
    assert.deepEqual(
      threadOwnerConstraint({ userId: 'alice', orgId: 'org-x' }),
      ['alice', 'org-x']
    )
  })

  test('threadOwnerConstraint matches nothing for a sessionless caller', () => {
    assert.deepEqual(threadOwnerConstraint(undefined), [])
    assert.deepEqual(threadOwnerConstraint({}), [])
  })
})

describe('C2 sessionScope + resume ownership', () => {
  const params = (session?: Record<string, unknown>) => ({
    sessionService: { get: () => session } as never,
  })

  test('agentSessionScope reads the declared scope and defaults to user', () => {
    addAgent('scoped-user')
    addAgent('scoped-org', { sessionScope: 'org' })
    assert.equal(agentSessionScope('scoped-user'), 'user')
    assert.equal(agentSessionScope('scoped-org'), 'org')
  })

  test('resume ownership: owner passes, a different user is rejected (via idempotent recompose)', () => {
    const stored = 'alice:default'
    assert.doesNotThrow(() =>
      assertResourceOwner(
        resolveOwnerResourceId(params({ userId: 'alice' }), 'user', stored),
        stored,
        'run'
      )
    )
    assert.throws(
      () =>
        assertResourceOwner(
          resolveOwnerResourceId(params({ userId: 'bob' }), 'user', stored),
          stored,
          'run'
        ),
      (e: unknown) => e instanceof ForbiddenError
    )
  })
})

describe('buildSubAgentRunInput (parent context forwarding)', () => {
  test('forwards the parent context onto the sub-agent run input', () => {
    const input = buildSubAgentRunInput(
      'find failing functions',
      'thread-1',
      'org-uuid',
      'organizationId: 11111111-1111-1111-1111-111111111111'
    )
    assert.deepEqual(input, {
      message: 'find failing functions',
      threadId: 'thread-1',
      resourceId: 'org-uuid',
      context: 'organizationId: 11111111-1111-1111-1111-111111111111',
    })
  })

  test('context is undefined when the parent run had none (root agent)', () => {
    const input = buildSubAgentRunInput('hi', 'thread-1', 'res-1')
    assert.equal(input.context, undefined)
  })
})

test('a tool description survives being stripped from the meta registered at boot', async () => {
  addAgent('described-agent')
  pikkuState(null, 'agent', 'agentsMeta')['described-agent'] = {
    ...pikkuState(null, 'agent', 'agentsMeta')['described-agent'],
    tools: ['archiveRecord'],
  } as any
  pikkuState(null, 'rpc', 'meta').archiveRecord = 'archiveRecord'

  // What the bundled copy actually looks like: `stripVerboseFields` removes
  // `description` and `title`, so the boot-time meta carries neither.
  pikkuState(null, 'function', 'meta').archiveRecord = {
    inputSchemaName: 'ArchiveInput',
    sessionless: true,
  }
  pikkuState(null, 'misc', 'schemas').set('ArchiveInput', { type: 'object' })
  pikkuState(null, 'function', 'functions').set('archiveRecord', {
    func: async () => 'ok',
  })

  pikkuState(null, 'package', 'singletonServices', {
    logger: { warn: () => {} },
    metaService: {
      getFunctionsMeta: async () => ({
        archiveRecord: {
          description: 'Archive a record so it stops appearing in searches',
        },
      }),
    },
  } as any)

  const { tools } = await buildToolDefs(
    {},
    new Map<string, string>(),
    'resource-described',
    'described-agent',
    null
  )

  assert.equal(tools.length, 1)
  assert.equal(
    tools[0].description,
    'Archive a record so it stops appearing in searches'
  )
})

test('a tool with no description anywhere is still offered, under its own name', async () => {
  addAgent('undescribed-agent')
  pikkuState(null, 'agent', 'agentsMeta')['undescribed-agent'] = {
    ...pikkuState(null, 'agent', 'agentsMeta')['undescribed-agent'],
    tools: ['bareTool'],
  } as any
  pikkuState(null, 'rpc', 'meta').bareTool = 'bareTool'
  // A title is deliberately not a description: it labels the tool in a UI, it
  // does not tell a model when to reach for it.
  pikkuState(null, 'function', 'meta').bareTool = {
    title: 'Bare Tool',
    inputSchemaName: 'BareInput',
    sessionless: true,
  }
  pikkuState(null, 'misc', 'schemas').set('BareInput', { type: 'object' })
  pikkuState(null, 'function', 'functions').set('bareTool', {
    func: async () => 'ok',
  })

  // No metaService at all — a bundle with no readable .pikku directory.
  pikkuState(null, 'package', 'singletonServices', {
    logger: { warn: () => {} },
  } as any)

  const { tools } = await buildToolDefs(
    {},
    new Map<string, string>(),
    'resource-undescribed',
    'undescribed-agent',
    null
  )

  assert.equal(tools.length, 1)
  assert.equal(tools[0].description, 'bareTool')
})
