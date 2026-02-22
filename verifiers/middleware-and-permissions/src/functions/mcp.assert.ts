import { runMCPTool, runMCPResource, runMCPPrompt } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test MCP tool middleware execution
 */
export async function testMCPToolWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run MCP Tool')
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runMCPTool(
        {
          jsonrpc: '2.0',
          id: 1,
          params: {},
        },
        {
          singletonServices,
          createWireServices,
        },
        'mcpToolFunction'
      )
    },
    singletonServices.logger
  )

  if (passed) {
    console.log('\n✓ MCP tool middleware execution test completed successfully')
  } else {
    console.log('\n✗ MCP tool middleware execution test failed')
  }

  return passed
}

/**
 * Test MCP resource middleware execution
 */
export async function testMCPResourceWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run MCP Resource')
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runMCPResource(
        {
          jsonrpc: '2.0',
          id: 1,
          params: {},
        },
        {
          singletonServices,
          createWireServices,
          mcp: {
            uri: 'test-resource',
            sendResourceUpdated: async () => {},
            enableTools: async () => true,
            enablePrompts: async () => true,
            enableResources: async () => true,
          },
        },
        'test-resource'
      )
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      '\n✓ MCP resource middleware execution test completed successfully'
    )
  } else {
    console.log('\n✗ MCP resource middleware execution test failed')
  }

  return passed
}

/**
 * Test MCP prompt middleware execution
 */
export async function testMCPPromptWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createWireServices: any
): Promise<boolean> {
  console.log('\n\nTest: Run MCP Prompt')
  console.log('─────────────────────────')

  const passed = await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runMCPPrompt(
        {
          jsonrpc: '2.0',
          id: 1,
          params: {},
        },
        {
          singletonServices,
          createWireServices,
        },
        'test-prompt'
      )
    },
    singletonServices.logger
  )

  if (passed) {
    console.log(
      '\n✓ MCP prompt middleware execution test completed successfully'
    )
  } else {
    console.log('\n✗ MCP prompt middleware execution test failed')
  }

  return passed
}
