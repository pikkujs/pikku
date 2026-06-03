import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MCPError,
  runMCPPrompt,
  runMCPResource,
  runMCPTool,
  wireMCPPrompt,
  wireMCPResource,
} from './mcp-runner.js'
import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const mcpWire = {
  sendResourceUpdated: () => {},
  enableResources: async () => true,
  enablePrompts: async () => true,
  enableTools: async () => true,
}

const registerFunction = (
  funcName: string,
  func: (services: any, data: any, wire: any) => Promise<unknown> | unknown,
  packageName: string | null = null
) => {
  addFunction(funcName, { func } as never, packageName)
  pikkuState(packageName, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
}

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger,
  } as never)
})

describe('wireMCPResource', () => {
  test('skips registration when metadata is missing', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message: string) => {
      warnings.push(message)
    }

    try {
      wireMCPResource({
        uri: 'resource://missing',
        title: 'Missing',
        description: 'Missing',
        func: { func: async () => ({ ok: true }) } as never,
      })
    } finally {
      console.warn = originalWarn
    }

    assert.equal(getResourceMap().has('resource://missing'), false)
    assert.match(
      warnings[0] || '',
      /Skipping MCP resource 'resource:\/\/missing'/
    )
  })

  test('throws when resource is registered twice', () => {
    pikkuState(null, 'mcp', 'resourcesMeta')['resource://users'] = {
      uri: 'resource://users',
      title: 'Users',
      description: 'Users',
      pikkuFuncId: 'resourceFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction('resourceFunc', async () => ({ ok: true }))

    const resource = {
      uri: 'resource://users',
      title: 'Users',
      description: 'Users',
      func: { func: async () => ({ ok: true }) } as never,
    }

    wireMCPResource(resource)

    assert.throws(() => wireMCPResource(resource), {
      message: 'MCP resource already exists: resource://users',
    })
  })
})

describe('wireMCPPrompt', () => {
  test('skips registration when metadata is missing', () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message: string) => {
      warnings.push(message)
    }

    try {
      wireMCPPrompt({
        name: 'missing-prompt',
        description: 'Missing',
        func: { func: async () => [] } as never,
      })
    } finally {
      console.warn = originalWarn
    }

    assert.equal(
      pikkuState(null, 'mcp', 'prompts').has('missing-prompt'),
      false
    )
    assert.match(warnings[0] || '', /Skipping MCP prompt 'missing-prompt'/)
  })
})

describe('runMCPResource', () => {
  test('matches uri templates and merges extracted params into the request', async () => {
    pikkuState(null, 'mcp', 'resourcesMeta')['resource://todos/{id}'] = {
      uri: 'resource://todos/{id}',
      title: 'Todo',
      description: 'Todo',
      pikkuFuncId: 'resourceFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction('resourceFunc', async () => ({ ok: false }))

    wireMCPResource({
      uri: 'resource://todos/{id}',
      title: 'Todo',
      description: 'Todo',
      func: {
        func: async (_services: any, data: any, wire: any) => ({
          data,
          uri: wire.mcp?.uri,
        }),
      } as never,
    })

    const response = await runMCPResource(
      {
        jsonrpc: '2.0',
        id: 'req-1',
        params: { include: 'details' },
      },
      { mcp: mcpWire as never },
      'resource://todos/42'
    )

    assert.deepEqual(response, {
      id: 'req-1',
      result: {
        data: { include: 'details', id: '42' },
        uri: 'resource://todos/42',
      },
    })
  })
})

describe('runMCPTool', () => {
  test('wraps non-MCPToolResponse output as text', async () => {
    pikkuState(null, 'mcp', 'toolsMeta').echo = {
      name: 'echo',
      title: 'Echo',
      description: 'Echo',
      pikkuFuncId: 'toolFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction('toolFunc', async (_services, data) => data)

    const response = await runMCPTool(
      {
        jsonrpc: '2.0',
        id: 'req-2',
        params: { hello: 'world' },
      },
      { mcp: mcpWire as never },
      'echo'
    )

    assert.deepEqual(response, {
      id: 'req-2',
      result: [{ type: 'text', text: '{"hello":"world"}' }],
    })
  })

  test('preserves MCPToolResponse output without wrapping', async () => {
    pikkuState(null, 'mcp', 'toolsMeta').toolResponse = {
      name: 'toolResponse',
      title: 'Tool Response',
      description: 'Tool Response',
      pikkuFuncId: 'toolResponseFunc',
      inputSchema: null,
      outputSchema: 'MCPToolResponse',
    } as never
    registerFunction('toolResponseFunc', async () => [
      { type: 'text', text: 'hello' },
    ])

    const response = await runMCPTool(
      {
        jsonrpc: '2.0',
        id: 'req-3',
        params: {},
      },
      { mcp: mcpWire as never },
      'toolResponse'
    )

    assert.deepEqual(response, {
      id: 'req-3',
      result: [{ type: 'text', text: 'hello' }],
    })
  })

  test('resolves namespaced tool function ids through addon packages', async () => {
    pikkuState(null, 'addons', 'packages').set('addon', {
      package: '@addon/pkg',
    } as never)
    pikkuState(null, 'mcp', 'toolsMeta').addonTool = {
      name: 'addonTool',
      title: 'Addon Tool',
      description: 'Addon Tool',
      pikkuFuncId: 'addon:toolFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction(
      'toolFunc',
      async () => ({
        packageName: 'root',
      }),
      null
    )
    registerFunction(
      'toolFunc',
      async (_services, data) => ({
        data,
        packageName: '@addon/pkg',
      }),
      '@addon/pkg'
    )

    const response = await runMCPTool(
      {
        jsonrpc: '2.0',
        id: 'req-4',
        params: { ok: true },
      },
      { mcp: mcpWire as never },
      'addonTool'
    )

    assert.deepEqual(response, {
      id: 'req-4',
      result: [
        {
          type: 'text',
          text: '{"data":{"ok":true},"packageName":"@addon/pkg"}',
        },
      ],
    })
  })

  test('maps bad jsonrpc version to MCP error code', async () => {
    pikkuState(null, 'mcp', 'toolsMeta').echo = {
      name: 'echo',
      title: 'Echo',
      description: 'Echo',
      pikkuFuncId: 'toolFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction('toolFunc', async () => ({ ok: true }))

    await assert.rejects(
      () =>
        runMCPTool(
          { jsonrpc: '1.0', id: 'bad-version', params: {} },
          { mcp: mcpWire as never },
          'echo'
        ),
      (error: unknown) => {
        assert.ok(error instanceof MCPError)
        assert.equal(error.error.code, -32600)
        assert.equal(error.error.id, 'bad-version')
        return true
      }
    )
  })

  test('maps unmapped runtime errors to internal MCP errors', async () => {
    pikkuState(null, 'mcp', 'toolsMeta').boom = {
      name: 'boom',
      title: 'Boom',
      description: 'Boom',
      pikkuFuncId: 'boomFunc',
      inputSchema: null,
      outputSchema: null,
    } as never
    registerFunction('boomFunc', async () => {
      throw new Error('boom')
    })

    await assert.rejects(
      () =>
        runMCPTool(
          { jsonrpc: '2.0', id: 'boom-1', params: {} },
          { mcp: mcpWire as never },
          'boom'
        ),
      (error: unknown) => {
        assert.ok(error instanceof MCPError)
        assert.equal(error.error.code, -32603)
        assert.equal(error.error.data?.message, 'boom')
        return true
      }
    )
  })
})

describe('runMCPPrompt', () => {
  test('maps missing prompt registration to not found MCP errors', async () => {
    pikkuState(null, 'mcp', 'promptsMeta').missingPrompt = {
      name: 'missingPrompt',
      description: 'Missing Prompt',
      pikkuFuncId: 'missingPromptFunc',
      inputSchema: null,
      outputSchema: null,
      arguments: [],
    } as never

    await assert.rejects(
      () =>
        runMCPPrompt(
          { jsonrpc: '2.0', id: 'prompt-1', params: {} },
          { mcp: mcpWire as never },
          'missingPrompt'
        ),
      (error: unknown) => {
        assert.ok(error instanceof MCPError)
        assert.equal(error.error.code, -32601)
        assert.match(
          error.error.message,
          /server cannot find the requested resource/i
        )
        return true
      }
    )
  })
})

const getResourceMap = () => {
  return pikkuState(null, 'mcp', 'resources')
}
