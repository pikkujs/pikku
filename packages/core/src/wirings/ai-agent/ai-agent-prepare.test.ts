import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  buildInstructions,
  buildToolDefs,
  createScopedChannel,
  getAddonCredentialRequirements,
  resolveAgent,
} from './ai-agent-prepare.js'
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
})
