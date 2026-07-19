import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  agentSessionScope,
  assertResourceOwner,
  buildInstructions,
  buildToolDefs,
  createScopedChannel,
  getAddonCredentialRequirements,
  resolveAgent,
  resolveOwnerResourceId,
} from './ai-agent-prepare.js'
import { ForbiddenError } from '../../errors/errors.js'
import type {
  AIStreamChannel,
  AIStreamEvent,
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'

beforeEach(() => {
  resetPikkuState()
})

const addAgent = (agentName: string, overrides: Partial<CoreAIAgent> = {}) => {
  const agent: CoreAIAgent = {
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

describe('ai-agent-prepare', () => {
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

    const addonAgent: CoreAIAgent = {
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

  test('createScopedChannel forwards stream events, captures approvals, and suppresses done', () => {
    const events: AIStreamEvent[] = []
    const channel = createScopedChannel(
      {
        channelId: 'root',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        sendBinary: () => {},
        close: () => {},
        setState: () => {},
        getState: () => 'open',
        clearState: () => {},
      } as AIStreamChannel,
      'sub-agent',
      'session-1'
    )

    channel.send({ type: 'text-delta', text: 'hello' } as AIStreamEvent)
    channel.send({
      type: 'approval-request',
      toolCallId: 'tc-1',
      toolName: 'tool-a',
      args: { x: 1 },
      reason: 'Delete todo "x"',
      runId: 'run-1',
    } as AIStreamEvent)
    channel.send({ type: 'done' } as AIStreamEvent)

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
    const middlewares: PikkuAIMiddlewareHooks[] = [
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

    // The addon builds `todoStore` in its own singleton services, which are NOT
    // in the root services and are only cached the first time the addon runs.
    // The approval is raised before the tool executes, so the cache is cold.
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

  test('buildToolDefs logs a tool execute() failure even without aiMiddleware hooks, then rethrows', async () => {
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

  test('user scope falls back to the bare requested resourceId when sessionless', () => {
    assert.equal(resolveOwnerResourceId({}, 'user', 'resource-1'), 'resource-1')
    assert.equal(
      resolveOwnerResourceId(params(undefined), 'user', 'resource-1'),
      'resource-1'
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
