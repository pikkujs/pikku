import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

import { testHTTPWiring } from './functions/http.assert.js'
import {
  testMCPToolWiring,
  testMCPResourceWiring,
  testMCPPromptWiring,
} from './functions/mcp.assert.js'
import { testSchedulerWiring } from './functions/scheduler.assert.js'
import { testQueueWiring } from './functions/queue.assert.js'
import { testCLIWiring } from './functions/cli.assert.js'
import { testChannelWiring } from './functions/channel-local.assert.js'
import { testChannelWiringServerless } from './functions/channel-serverless.assert.js'
import { testInternalRPCWiring } from './functions/rpc.assert.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    console.log('\nMiddleware and Permissions Example')
    console.log('===================================')
    console.log(
      '\nThis example demonstrates middleware and permission generation and execution order.'
    )
    console.log(
      '\nAll wiring types are configured with middleware and permissions:'
    )
    console.log(
      '  - HTTP: Routes with tag, route pattern, and wire middleware/permissions'
    )
    console.log(
      '  - Scheduler: Cron tasks with tag and wire middleware/permissions'
    )
    console.log(
      '  - Queue: Background jobs with tag and wire middleware/permissions'
    )
    console.log('  - CLI: Commands with tag and wire middleware/permissions')
    console.log(
      '  - MCP: Tools, Resources, and Prompts with tag and wire middleware/permissions'
    )
    console.log('\nGenerated files:')
    console.log('  .pikku/middleware/pikku-middleware.gen.ts')
    console.log('  .pikku/middleware/pikku-middleware-groups-meta.gen.ts')
    console.log('  .pikku/http/pikku-http-wirings-meta.gen.ts')
    console.log('  .pikku/scheduler/pikku-schedulers-wirings-meta.gen.ts')
    console.log('  .pikku/cli/pikku-cli-wirings-meta.gen.ts')

    // Test HTTP endpoints
    const httpTest1Passed = await testHTTPWiring(
      '/api/test',
      [
        { name: 'global', type: 'http', phase: 'before' },
        { name: '/api/*', type: 'route', phase: 'before' },
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'api', type: 'tag', phase: 'before' },
        { name: 'api-test', type: 'wire', phase: 'before' },
        { name: 'inline', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'global', type: 'http-permission' },
        { name: '/api/*', type: 'http-permission' },
        { name: 'read', type: 'tag-permission' },
        { name: 'wire', type: 'wire-permission' },
        { name: 'inline', type: 'wire-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    const httpTest2Passed = await testHTTPWiring(
      '/simple',
      [
        { name: 'global', type: 'http', phase: 'before' },
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'global', type: 'http-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Scheduler
    const schedulerPassed = await testSchedulerWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'scheduler', type: 'tag', phase: 'before' },
        { name: 'scheduler', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'scheduler', type: 'tag-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Queue
    const queuePassed = await testQueueWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'queue', type: 'tag', phase: 'before' },
        { name: 'queue', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'queue', type: 'tag-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test CLI
    const cliPassed = await testCLIWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'wire', phase: 'before' },
        { name: 'command', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'wire', phase: 'before' },
        { name: 'command', type: 'wire', phase: 'before' },
        { name: 'subcommand', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices as any
    )

    // Test MCP Tool
    const mcpToolPassed = await testMCPToolWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'mcp', type: 'tag-permission' },
        { name: 'mcp-wire', type: 'wire-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test MCP Resource
    const mcpResourcePassed = await testMCPResourceWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'mcp', type: 'tag-permission' },
        { name: 'mcp-wire', type: 'wire-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test MCP Prompt
    const mcpPromptPassed = await testMCPPromptWiring(
      [
        { name: 'session', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'mcp', type: 'tag-permission' },
        { name: 'mcp-wire', type: 'wire-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Channel (Local Runner)
    // TODO: Fix middleware execution order - function inline middleware should run AFTER tag middleware
    // Currently: channel-inline → noOp (function) → function (tag)
    // Should be: channel-inline → function (tag) → noOp (function)
    const channelTest1Passed = await testChannelWiring(
      '/test-channel',
      'simple',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' }, // TODO: Should be after 'function' tag
        { name: 'function', type: 'tag', phase: 'before' }, // TODO: Should be before 'noOp'
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Channel - with message middleware
    const channelTest2Passed = await testChannelWiring(
      '/test-channel',
      'withMiddleware',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'message-middleware', type: 'message', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Channel - with wire middleware
    const channelTest3Passed = await testChannelWiring(
      '/test-channel',
      'withWireMiddleware',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'channel-test', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Channel - with both types of middleware
    const channelTest4Passed = await testChannelWiring(
      '/test-channel',
      'withBoth',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'channel-test', type: 'wire', phase: 'before' },
        { name: 'message-middleware', type: 'message', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Channel (Serverless Runner)
    // TODO: Fix middleware execution order - same bug as local runner
    const channelServerlessTest1Passed = await testChannelWiringServerless(
      '/test-channel',
      'simple',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' }, // TODO: Should be after 'function' tag
        { name: 'function', type: 'tag', phase: 'before' }, // TODO: Should be before 'noOp'
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    const channelServerlessTest2Passed = await testChannelWiringServerless(
      '/test-channel',
      'withMiddleware',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'message-middleware', type: 'message', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    const channelServerlessTest3Passed = await testChannelWiringServerless(
      '/test-channel',
      'withWireMiddleware',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'channel-test', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    const channelServerlessTest4Passed = await testChannelWiringServerless(
      '/test-channel',
      'withBoth',
      {},
      [
        { name: 'onConnect', type: 'lifecycle', phase: 'execute' },
        { name: 'channel-inline', type: 'wire', phase: 'before' },
        { name: 'channel-test', type: 'wire', phase: 'before' },
        { name: 'message-middleware', type: 'message', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        { name: 'onDisconnect', type: 'lifecycle', phase: 'execute' },
      ],
      singletonServices,
      createWireServices
    )

    // Test Internal RPC with external package call
    // Note: testExternalWithAuth only has 'function' tag (no 'session' tag)
    // When calling ext:hello, the external package's middleware and permissions also execute
    const rpcPassed = await testInternalRPCWiring(
      [
        // Main package function middleware/permissions
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'testExternal', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
        // External package function middleware/permissions (when ext:hello is called)
        // External package's 'external' tag middleware and permission
        { name: 'external', type: 'external-tag', phase: 'before' },
        { name: 'hello', type: 'external-function', phase: 'before' },
        { name: 'external', type: 'external-tag-permission' },
        { name: 'external', type: 'external-function-permission' },
      ],
      singletonServices,
      createWireServices
    )

    const allPassed =
      httpTest1Passed &&
      httpTest2Passed &&
      schedulerPassed &&
      queuePassed &&
      cliPassed &&
      mcpToolPassed &&
      mcpResourcePassed &&
      mcpPromptPassed &&
      channelTest1Passed &&
      channelTest2Passed &&
      channelTest3Passed &&
      channelTest4Passed &&
      channelServerlessTest1Passed &&
      channelServerlessTest2Passed &&
      channelServerlessTest3Passed &&
      channelServerlessTest4Passed &&
      rpcPassed

    if (allPassed) {
      console.log('\n\n✓ All wiring types tested successfully!')
    } else {
      console.log('\n\n✗ Some tests failed!')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
