import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

// TODO: MCP wiring not working - metadata not being generated
// import './functions/mcp.wiring.js'

import { testHTTPWiring } from './functions/http.test.js'
import { testSchedulerWiring } from './functions/scheduler.test.js'
import { testQueueWiring } from './functions/queue.test.js'
import { testCLIWiring } from './functions/cli.test.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    console.log('\nMiddleware Example')
    console.log('==================')
    console.log(
      '\nThis example demonstrates middleware generation and execution order.'
    )
    console.log('\nAll wiring types are configured with middleware:')
    console.log('  - HTTP: Routes with tag, route pattern, and wire middleware')
    console.log('  - Scheduler: Cron tasks with tag and wire middleware')
    console.log('  - Queue: Background jobs with tag and wire middleware')
    console.log('  - CLI: Commands with tag and wire middleware')
    console.log('  - MCP: Tools with tag and wire middleware')
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
        { name: 'global', type: 'http' },
        { name: '/api/*', type: 'route' },
        { name: 'api', type: 'tag' },
        { name: 'wire', type: 'wire' },
        { name: 'inline', type: 'wire' },
        { name: 'noOp', type: 'function' },
      ],
      singletonServices,
      createSessionServices as any
    )

    const httpTest2Passed = await testHTTPWiring(
      '/simple',
      [
        { name: 'global', type: 'http' },
        { name: 'noOp', type: 'function' },
      ],
      singletonServices,
      createSessionServices as any
    )

    // Test Scheduler
    const schedulerPassed = await testSchedulerWiring(
      [
        { name: 'api', type: 'tag' },
        { name: 'wire', type: 'wire' },
        { name: 'noOp', type: 'function' },
      ],
      singletonServices,
      createSessionServices as any
    )

    // Test Queue
    const queuePassed = await testQueueWiring(
      [
        { name: 'api', type: 'tag' },
        { name: 'wire', type: 'wire' },
        { name: 'noOp', type: 'function' },
      ],
      singletonServices,
      createSessionServices as any
    )

    // Test CLI
    const cliPassed = await testCLIWiring(
      [
        { name: 'wire', type: 'wire' },
        { name: 'noOp', type: 'function' },
      ],
      singletonServices,
      createSessionServices as any
    )

    // TODO: Test 6: MCP tool - skipped for now (metadata generation issue)
    // await testMCPWiring(singletonServices, createSessionServices)

    const allPassed =
      httpTest1Passed &&
      httpTest2Passed &&
      schedulerPassed &&
      queuePassed &&
      cliPassed

    if (allPassed) {
      console.log('\n\n✓ All implemented wiring types tested successfully!')
      console.log(
        'Note: MCP wiring test skipped - metadata generation needs to be fixed'
      )
    } else {
      console.log('\n\n✗ Some tests failed!')
      console.log(
        'Note: MCP wiring test skipped - metadata generation needs to be fixed'
      )
      process.exit(1)
    }
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
