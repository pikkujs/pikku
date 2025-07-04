import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  addMCPEndpoint,
  addMCPResource,
  addMCPTool,
  getMCPEndpoints,
  getMCPResources,
  getMCPTools,
  runMCPEndpointJsonRpc,
  handleMCPJsonRpcRequest,
  JSON_RPC_ERRORS,
} from './mcp-runner.js'
import { resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'

describe('MCP Runner', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('addMCPResource should register a resource', () => {
    // First, we need to set up the metadata (normally done by the inspector)
    const endpointMeta = {
      getUser: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        name: 'getUser',
        description: 'Get a user by ID',
        type: 'resource' as const,
      },
    }

    // Manually set the metadata (normally done by CLI)
    const { pikkuState } = globalThis
    pikkuState.mcp.meta = endpointMeta

    const getUserFunc = async (services: any, data: { userId: string }) => {
      return {
        userId: data.userId,
        name: 'Test User',
        email: 'test@example.com',
      }
    }

    // Manually register the function (normally done by addFunction in CLI)
    addFunction('pikkuFn_test_L1C1', { func: getUserFunc })

    addMCPResource({
      name: 'getUser',
      description: 'Get a user by ID',
      func: getUserFunc,
    })

    const endpoints = getMCPEndpoints()
    assert.strictEqual(endpoints.size, 1)
    assert.ok(endpoints.has('getUser'))

    const endpoint = endpoints.get('getUser')
    assert.strictEqual(endpoint?.name, 'getUser')
    assert.strictEqual(endpoint?.description, 'Get a user by ID')
    assert.strictEqual(endpoint?.type, 'resource')

    // Also test legacy function
    const resources = getMCPResources()
    assert.strictEqual(resources.size, 1)
    assert.ok(resources.has('getUser'))
  })

  test('addMCPTool should register a tool', () => {
    // First, we need to set up the metadata (normally done by the inspector)
    const endpointMeta = {
      calculateStats: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        name: 'calculateStats',
        description: 'Calculate statistics',
        type: 'tool' as const,
        streaming: false,
      },
    }

    // Manually set the metadata (normally done by CLI)
    const { pikkuState } = globalThis
    pikkuState.mcp.meta = endpointMeta

    const calculateStatsFunc = async (
      services: any,
      data: { metrics: string[] }
    ) => {
      return {
        results: data.metrics.map((metric) => ({
          metric,
          value: Math.random() * 100,
        })),
      }
    }

    // Manually register the function (normally done by addFunction in CLI)
    addFunction('pikkuFn_test_L1C1', { func: calculateStatsFunc })

    addMCPTool({
      name: 'calculateStats',
      description: 'Calculate statistics',
      streaming: false,
      func: calculateStatsFunc,
    })

    const endpoints = getMCPEndpoints()
    assert.strictEqual(endpoints.size, 1)
    assert.ok(endpoints.has('calculateStats'))

    const endpoint = endpoints.get('calculateStats')
    assert.strictEqual(endpoint?.name, 'calculateStats')
    assert.strictEqual(endpoint?.description, 'Calculate statistics')
    assert.strictEqual(endpoint?.type, 'tool')
    assert.strictEqual(endpoint?.streaming, false)

    // Also test legacy function
    const tools = getMCPTools()
    assert.strictEqual(tools.size, 1)
    assert.ok(tools.has('calculateStats'))
  })

  test('should throw error if metadata not found', () => {
    const getUserFunc = async (services: any, data: { userId: string }) => {
      return { userId: data.userId, name: 'Test User' }
    }

    assert.throws(() => {
      addMCPResource({
        name: 'nonexistentResource',
        description: 'This should fail',
        func: getUserFunc,
      })
    }, /MCP endpoint metadata not found/)
  })

  test('addMCPEndpoint should register any endpoint type', () => {
    // First, we need to set up the metadata (normally done by the inspector)
    const endpointMeta = {
      customEndpoint: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        name: 'customEndpoint',
        description: 'A custom endpoint',
        type: 'tool' as const,
        streaming: true,
      },
    }

    // Manually set the metadata (normally done by CLI)
    const { pikkuState } = globalThis
    pikkuState.mcp.meta = endpointMeta

    const customFunc = async (services: any, data: { input: string }) => {
      return { output: data.input.toUpperCase() }
    }

    // Manually register the function (normally done by addFunction in CLI)
    addFunction('pikkuFn_test_L1C1', { func: customFunc })

    addMCPEndpoint({
      name: 'customEndpoint',
      description: 'A custom endpoint',
      type: 'tool',
      streaming: true,
      func: customFunc,
    })

    const endpoints = getMCPEndpoints()
    assert.strictEqual(endpoints.size, 1)
    assert.ok(endpoints.has('customEndpoint'))

    const endpoint = endpoints.get('customEndpoint')
    assert.strictEqual(endpoint?.name, 'customEndpoint')
    assert.strictEqual(endpoint?.description, 'A custom endpoint')
    assert.strictEqual(endpoint?.type, 'tool')
    assert.strictEqual(endpoint?.streaming, true)
  })

  test('runMCPEndpointJsonRpc should handle JSON-RPC 2.0 requests', async () => {
    // Set up function metadata first
    const { pikkuState } = globalThis
    pikkuState.function.meta = {
      pikkuFn_echo_L1C1: {
        pikkuFuncName: 'pikkuFn_echo_L1C1',
        services: [],
      },
    }

    // Set up MCP endpoint metadata
    const endpointMeta = {
      echo: {
        pikkuFuncName: 'pikkuFn_echo_L1C1',
        name: 'echo',
        description: 'Echo the input',
        type: 'tool' as const,
      },
    }

    pikkuState.mcp.meta = endpointMeta

    const echoFunc = async (services: any, data: { message: string }) => {
      return { echo: data.message }
    }

    addFunction('pikkuFn_echo_L1C1', { func: echoFunc })

    addMCPEndpoint({
      name: 'echo',
      description: 'Echo the input',
      type: 'tool',
      func: echoFunc,
    })

    // Mock services
    const mockLogger = { info: () => {}, error: () => {} }
    const mockServices = { logger: mockLogger } as any

    // Test successful JSON-RPC request
    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'echo',
      params: { message: 'Hello World' },
    }

    const response = await runMCPEndpointJsonRpc(request, {
      singletonServices: mockServices,
    })

    assert.strictEqual(response.jsonrpc, '2.0')
    assert.strictEqual(response.id, '1')
    assert.ok(!response.error)
    assert.ok(response.result)
    assert.strictEqual(response.result.echo, 'Hello World')
  })

  test('runMCPEndpointJsonRpc should handle method not found', async () => {
    const mockLogger = { info: () => {}, error: () => {} }
    const mockServices = { logger: mockLogger } as any

    const request = {
      jsonrpc: '2.0' as const,
      id: '1',
      method: 'nonexistent',
      params: {},
    }

    const response = await runMCPEndpointJsonRpc(request, {
      singletonServices: mockServices,
    })

    assert.strictEqual(response.jsonrpc, '2.0')
    assert.strictEqual(response.id, '1')
    assert.ok(response.error)
    assert.strictEqual(
      response.error?.code,
      JSON_RPC_ERRORS.METHOD_NOT_FOUND.code
    )
    assert.ok(!response.result)
  })

  test('handleMCPJsonRpcRequest should parse JSON strings', async () => {
    // Set up function metadata first
    const { pikkuState } = globalThis
    pikkuState.function.meta = {
      pikkuFn_test_L1C1: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        services: [],
      },
    }

    // Set up a simple endpoint
    const endpointMeta = {
      test: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        name: 'test',
        description: 'Test endpoint',
        type: 'tool' as const,
      },
    }

    pikkuState.mcp.meta = endpointMeta

    const testFunc = async () => ({ success: true })
    addFunction('pikkuFn_test_L1C1', { func: testFunc })
    addMCPEndpoint({
      name: 'test',
      description: 'Test endpoint',
      type: 'tool',
      func: testFunc,
    })

    const mockLogger = { info: () => {}, error: () => {} }
    const mockServices = { logger: mockLogger } as any

    // Test JSON string parsing
    const jsonRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'test',
      params: {},
    })

    const response = (await handleMCPJsonRpcRequest(jsonRequest, {
      singletonServices: mockServices,
    })) as any

    assert.strictEqual(response.jsonrpc, '2.0')
    assert.strictEqual(response.id, '1')
    assert.ok(response.result)
    assert.strictEqual(response.result.success, true)
  })

  test('handleMCPJsonRpcRequest should handle parse errors', async () => {
    const mockLogger = { info: () => {}, error: () => {} }
    const mockServices = { logger: mockLogger } as any

    const response = (await handleMCPJsonRpcRequest('invalid json', {
      singletonServices: mockServices,
    })) as any

    assert.strictEqual(response.jsonrpc, '2.0')
    assert.strictEqual(response.id, null)
    assert.ok(response.error)
    assert.strictEqual(response.error.code, JSON_RPC_ERRORS.PARSE_ERROR.code)
  })
})
