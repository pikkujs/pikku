import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeMCPJson } from './serialize-mcp-json.js'

describe('serializeMCPJson', () => {
  test('should generate MCP JSON with tools and resources', async () => {
    const typesMap = {
      getUniqueName: (type: string) => type, // Simple mock
    } as any
    const functionsMeta = {
      pikkuFn_test_L1C1: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        inputs: ['GetUserInput'],
        outputs: ['GetUserOutput'],
      },
      pikkuFn_test_L2C1: {
        pikkuFuncName: 'pikkuFn_test_L2C1',
        inputs: ['CalculateStatsInput'],
        outputs: ['CalculateStatsOutput'],
      },
    }

    const mcpEndpointsMeta = {
      getUser: {
        pikkuFuncName: 'pikkuFn_test_L1C1',
        name: 'getUser',
        description: 'Get a user by ID',
        type: 'resource' as const,
      },
      calculateStats: {
        pikkuFuncName: 'pikkuFn_test_L2C1',
        name: 'calculateStats',
        description: 'Calculate statistics',
        type: 'tool' as const,
        streaming: false,
      },
    }

    // Mock schema directory - this would normally contain JSON schema files
    const schemaDirectory = '/tmp/nonexistent'

    const result = await serializeMCPJson(
      schemaDirectory,
      functionsMeta,
      typesMap,
      mcpEndpointsMeta
    )

    const parsed = JSON.parse(result)

    assert.ok(parsed.tools)
    assert.strictEqual(parsed.tools.length, 2)

    // Check resource
    const resource = parsed.tools.find((tool: any) => tool.name === 'getUser')
    assert.ok(resource)
    assert.strictEqual(resource.name, 'getUser')
    assert.strictEqual(resource.description, 'Get a user by ID')

    // Check tool
    const tool = parsed.tools.find(
      (tool: any) => tool.name === 'calculateStats'
    )
    assert.ok(tool)
    assert.strictEqual(tool.name, 'calculateStats')
    assert.strictEqual(tool.description, 'Calculate statistics')
    assert.strictEqual(tool.streaming, undefined) // Should not include false values
  })
})
