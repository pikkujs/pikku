import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import './functions/mcp.wiring.js'

import { testHTTPWiring } from './functions/http.assert.js'
import { testMCPWiring } from './functions/mcp.assert.js'
import { testSchedulerWiring } from './functions/scheduler.assert.js'
import { testQueueWiring } from './functions/queue.assert.js'
import { testCLIWiring } from './functions/cli.assert.js'

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
    console.log('  - MCP: Tools with tag and wire middleware/permissions')
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
      createSessionServices
    )

    const httpTest2Passed = await testHTTPWiring(
      '/simple',
      [
        { name: 'global', type: 'http', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'global', type: 'http-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createSessionServices
    )

    // Test Scheduler
    const schedulerPassed = await testSchedulerWiring(
      [
        { name: 'scheduler', type: 'tag', phase: 'before' },
        { name: 'scheduler', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createSessionServices
    )

    // Test Queue
    const queuePassed = await testQueueWiring(
      [
        { name: 'queue', type: 'tag', phase: 'before' },
        { name: 'queue', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createSessionServices
    )

    // Test CLI
    const cliPassed = await testCLIWiring(
      [
        { name: 'cli', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'wire', phase: 'before' },
        { name: 'command', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      [
        { name: 'cli', type: 'tag', phase: 'before' },
        { name: 'cli', type: 'wire', phase: 'before' },
        { name: 'command', type: 'wire', phase: 'before' },
        { name: 'subcommand', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createSessionServices as any
    )

    // Test MCP
    const mcpPassed = await testMCPWiring(
      [
        { name: 'mcp', type: 'tag', phase: 'before' },
        { name: 'mcp', type: 'wire', phase: 'before' },
        { name: 'function', type: 'tag', phase: 'before' },
        { name: 'noOp', type: 'function', phase: 'before' },
        { name: 'mcp', type: 'tag-permission' },
        { name: 'mcp-wire', type: 'wire-permission' },
        { name: 'function', type: 'function-permission' },
      ],
      singletonServices,
      createSessionServices
    )

    const allPassed =
      httpTest1Passed &&
      httpTest2Passed &&
      schedulerPassed &&
      queuePassed &&
      cliPassed &&
      mcpPassed

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
