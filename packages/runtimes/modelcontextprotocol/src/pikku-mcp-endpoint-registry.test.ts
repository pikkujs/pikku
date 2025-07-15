import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { MCPEndpointRegistry } from './pikku-mcp-endpoint-registry.js'

describe('MCPEndpointRegistry', () => {
  let registry: MCPEndpointRegistry

  beforeEach(() => {
    registry = new MCPEndpointRegistry()
  })

  describe('constructor', () => {
    test('should initialize with empty maps', () => {
      assert.deepStrictEqual(registry.getTools(), [])
      assert.deepStrictEqual(registry.getResources(), [])
      assert.deepStrictEqual(registry.getPrompts(), [])
    })
  })

  describe('loadFromMCPJson', () => {
    test('should load tools from MCP JSON', async () => {
      const mockData = {
        tools: [
          {
            name: 'test-tool',
            title: 'Test Tool',
            description: 'A test tool',
            parameters: { type: 'object' },
            returns: { type: 'string' },
            enabled: true,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const tools = registry.getTools()
      assert.strictEqual(tools.length, 1)
      assert.strictEqual(tools[0].name, 'test-tool')
      assert.strictEqual(tools[0].title, 'Test Tool')
      assert.strictEqual(tools[0].description, 'A test tool')
      assert.deepStrictEqual(tools[0].inputSchema, { type: 'object' })
      assert.deepStrictEqual(tools[0].outputSchema, { type: 'string' })
      assert.strictEqual(tools[0].enabled, true)
    })

    test('should load resources from MCP JSON', async () => {
      const mockData = {
        resources: [
          {
            name: 'test-resource',
            uri: 'file://test.txt',
            description: 'A test resource',
            parameters: { type: 'object' },
            enabled: false,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const resources = registry.getResources()
      assert.strictEqual(resources.length, 1)
      assert.strictEqual(resources[0].title, 'test-resource')
      assert.strictEqual(resources[0].uri, 'file://test.txt')
      assert.strictEqual(resources[0].description, 'A test resource')
      assert.deepStrictEqual(resources[0].inputSchema, { type: 'object' })
      assert.strictEqual(resources[0].enabled, false)
    })

    test('should load prompts from MCP JSON', async () => {
      const mockData = {
        prompts: [
          {
            name: 'test-prompt',
            description: 'A test prompt',
            arguments: { type: 'object' },
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const prompts = registry.getPrompts()
      assert.strictEqual(prompts.length, 1)
      assert.strictEqual(prompts[0].name, 'test-prompt')
      assert.strictEqual(prompts[0].description, 'A test prompt')
      assert.deepStrictEqual(prompts[0].inputSchema, { type: 'object' })
      assert.strictEqual(prompts[0].enabled, true)
    })

    test('should handle tools with default enabled state', async () => {
      const mockData = {
        tools: [
          {
            name: 'default-tool',
            title: 'Default Tool',
            description: 'Tool with default enabled state',
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const tools = registry.getTools()
      assert.strictEqual(tools.length, 1)
      assert.strictEqual(tools[0].enabled, true)
    })

    test('should handle empty arrays', async () => {
      const mockData = {
        tools: [],
        resources: [],
        prompts: [],
      }

      await registry.loadFromMCPJson(mockData)

      assert.deepStrictEqual(registry.getTools(), [])
      assert.deepStrictEqual(registry.getResources(), [])
      assert.deepStrictEqual(registry.getPrompts(), [])
    })

    test('should handle missing arrays', async () => {
      const mockData = {}

      await registry.loadFromMCPJson(mockData)

      assert.deepStrictEqual(registry.getTools(), [])
      assert.deepStrictEqual(registry.getResources(), [])
      assert.deepStrictEqual(registry.getPrompts(), [])
    })

    test('should handle empty object gracefully', async () => {
      // Test with empty object
      await registry.loadFromMCPJson({})
      assert.deepStrictEqual(registry.getTools(), [])
      assert.deepStrictEqual(registry.getResources(), [])
      assert.deepStrictEqual(registry.getPrompts(), [])
    })
  })

  describe('meta setters and getters', () => {
    test('should set and check resource meta', () => {
      const meta = {
        'test-resource': {
          uri: 'file://test.txt',
          title: 'Test Resource',
          description: 'Test description',
          pikkuFuncName: 'testResource',
          inputSchema: null,
          outputSchema: null,
          mimeType: 'text/plain',
        },
      }
      registry.setResourcesMeta(meta)
      assert.strictEqual(registry.hasResource('test-resource'), true)
      assert.strictEqual(registry.hasResource('nonexistent'), false)
    })

    test('should set and check tool meta', () => {
      const meta = {
        'test-tool': {
          name: 'test-tool',
          title: 'Test Tool',
          description: 'Test description',
          pikkuFuncName: 'testTool',
          inputSchema: null,
          outputSchema: null,
        },
      }
      registry.setToolsMeta(meta)
      assert.strictEqual(registry.hasTool('test-tool'), true)
      assert.strictEqual(registry.hasTool('nonexistent'), false)
    })

    test('should set and check prompt meta', () => {
      const meta = {
        'test-prompt': {
          name: 'test-prompt',
          description: 'Test Prompt',
          pikkuFuncName: 'testPrompt',
          inputSchema: null,
          outputSchema: null,
          arguments: [],
        },
      }
      registry.setPromptsMeta(meta)
      assert.strictEqual(registry.hasPrompt('test-prompt'), true)
      assert.strictEqual(registry.hasPrompt('nonexistent'), false)
    })
  })

  describe('individual item getters', () => {
    beforeEach(async () => {
      const mockData = {
        tools: [
          {
            name: 'tool1',
            title: 'Tool 1',
            description: 'First tool',
            enabled: true,
          },
        ],
        resources: [
          {
            name: 'resource1',
            uri: 'file://resource1.txt',
            description: 'First resource',
            enabled: true,
          },
        ],
        prompts: [
          {
            name: 'prompt1',
            description: 'First prompt',
            enabled: true,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)
    })

    test('should get tool by name', () => {
      const tool = registry.getTool('tool1')
      assert.strictEqual(tool?.name, 'tool1')
      assert.strictEqual(tool?.title, 'Tool 1')
      assert.strictEqual(registry.getTool('nonexistent'), undefined)
    })

    test('should get resource by name', () => {
      const resource = registry.getResource('resource1')
      assert.strictEqual(resource?.title, 'resource1')
      assert.strictEqual(resource?.uri, 'file://resource1.txt')
      assert.strictEqual(registry.getResource('nonexistent'), undefined)
    })

    test('should get prompt by name', () => {
      const prompt = registry.getPrompt('prompt1')
      assert.strictEqual(prompt?.name, 'prompt1')
      assert.strictEqual(prompt?.description, 'First prompt')
      assert.strictEqual(registry.getPrompt('nonexistent'), undefined)
    })
  })

  describe('getTools filters enabled tools', () => {
    test('should only return enabled tools', async () => {
      const mockData = {
        tools: [
          {
            name: 'enabled-tool',
            title: 'Enabled Tool',
            description: 'This tool is enabled',
            enabled: true,
          },
          {
            name: 'disabled-tool',
            title: 'Disabled Tool',
            description: 'This tool is disabled',
            enabled: false,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const tools = registry.getTools()
      assert.strictEqual(tools.length, 1)
      assert.strictEqual(tools[0].name, 'enabled-tool')
    })
  })

  describe('enable/disable methods', () => {
    beforeEach(async () => {
      const mockData = {
        tools: [
          {
            name: 'tool1',
            title: 'Tool 1',
            description: 'First tool',
            enabled: true,
          },
          {
            name: 'tool2',
            title: 'Tool 2',
            description: 'Second tool',
            enabled: false,
          },
        ],
        resources: [
          {
            name: 'resource1',
            uri: 'file://resource1.txt',
            description: 'First resource',
            enabled: true,
          },
        ],
        prompts: [
          {
            name: 'prompt1',
            description: 'First prompt',
            enabled: true,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)
    })

    test('should enable/disable tools and return change status', () => {
      let changed = registry.enableTools({ tool1: false, tool2: true })
      assert.strictEqual(changed, true)

      const tool1 = registry.getTool('tool1')
      const tool2 = registry.getTool('tool2')
      assert.strictEqual(tool1?.enabled, false)
      assert.strictEqual(tool2?.enabled, true)

      changed = registry.enableTools({ tool1: false, tool2: true })
      assert.strictEqual(changed, false)
    })

    test('should handle nonexistent tools', () => {
      const changed = registry.enableTools({ nonexistent: true })
      assert.strictEqual(changed, false)
    })

    test('should enable/disable prompts and return change status', () => {
      let changed = registry.enablePrompts({ prompt1: false })
      assert.strictEqual(changed, true)

      const prompt1 = registry.getPrompt('prompt1')
      assert.strictEqual(prompt1?.enabled, false)

      changed = registry.enablePrompts({ prompt1: false })
      assert.strictEqual(changed, false)
    })

    test('should handle nonexistent prompts', () => {
      const changed = registry.enablePrompts({ nonexistent: true })
      assert.strictEqual(changed, false)
    })

    test('should enable/disable resources', () => {
      const changed = registry.enableResources({ resource1: false })
      assert.strictEqual(changed, true)

      const resource1 = registry.getResource('resource1')
      assert.strictEqual(resource1?.enabled, false)
    })
  })

  describe('edge cases', () => {
    test('should handle null/undefined values in MCP JSON', async () => {
      const mockData = {
        tools: [
          {
            name: 'incomplete-tool',
            title: null,
            description: undefined,
          },
        ],
      }

      await registry.loadFromMCPJson(mockData)

      const tools = registry.getTools()
      assert.strictEqual(tools.length, 1)
      assert.strictEqual(tools[0].name, 'incomplete-tool')
      assert.strictEqual(tools[0].title, null)
      assert.strictEqual(tools[0].description, undefined)
    })

    test('should handle non-array values for tools/resources/prompts', async () => {
      const mockData = {
        tools: 'not an array',
        resources: null,
        prompts: undefined,
      }

      await registry.loadFromMCPJson(mockData)

      assert.deepStrictEqual(registry.getTools(), [])
      assert.deepStrictEqual(registry.getResources(), [])
      assert.deepStrictEqual(registry.getPrompts(), [])
    })
  })
})
