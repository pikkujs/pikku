import { runMCPTool } from '@pikku/core'
import { assertMiddlewareAndPermissions } from '../assert-combined.js'
import type { ExpectedEvent } from '../assert-combined.js'

/**
 * Test MCP tool middleware execution
 */
export async function testMCPWiring(
  expected: ExpectedEvent[],
  singletonServices: any,
  createSessionServices: any
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
          createSessionServices,
        },
        'test-tool'
      )
    },
    singletonServices.logger
  )

  if (passed) {
    console.log('\n✓ MCP middleware execution test completed successfully')
  } else {
    console.log('\n✗ MCP middleware execution test failed')
  }

  return passed
}
