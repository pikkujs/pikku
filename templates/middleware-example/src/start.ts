import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import '../.pikku/middleware/pikku-middleware.gen.js' // Load middleware factories
import '../.pikku/http/pikku-http-wirings-meta.gen.js' // Load HTTP metadata
import '../.pikku/scheduler/pikku-schedulers-wirings-meta.gen.js' // Load scheduler metadata
import '../.pikku/cli/pikku-cli-wirings-meta.gen.js' // Load CLI metadata
import './functions/http.wiring.js' // Import HTTP wirings to register routes
import './functions/scheduler.wiring.js' // Import scheduler wirings
import './functions/queue.wiring.js' // Import queue wirings
import './functions/cli.wiring.js' // Import CLI wirings
import './functions/mcp.wiring.js' // Import MCP wirings
import { fetch } from '@pikku/core/http'

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

    // Test 1: /api/test route (should have all middleware layers)
    console.log('\n\nTest 1: GET /api/test')
    console.log('─────────────────────────')
    console.log('Expected middleware order:')
    console.log('  1. httpMiddleware (HTTP global: *)')
    console.log('  2. routeMiddleware (HTTP pattern: /api/*)')
    console.log('  3. globalMiddleware (Tag: api)')
    console.log('  4. wireMiddleware (Wire-level)')
    console.log('  5. Inline middleware (Wire-level)')

    await fetch(new Request('http://localhost/api/test'), {
      singletonServices,
      createSessionServices: createSessionServices as any,
      skipUserSession: true,
    })

    console.log('\nActual execution order:')
    const execution1 = singletonServices.logger.getLogs()
    const beforeEvents1 = execution1.filter((e) => e.phase === 'before')
    if (beforeEvents1.length > 0) {
      beforeEvents1.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.name} (${event.type})`)
      })
    } else {
      console.log('  No middleware executed')
    }
    singletonServices.logger.clear()

    // Test 2: /simple route (should only have global HTTP middleware)
    console.log('\n\nTest 2: GET /simple')
    console.log('─────────────────────────')
    console.log('Expected middleware order:')
    console.log('  1. httpMiddleware (HTTP global: *)')

    await fetch(new Request('http://localhost/simple'), {
      singletonServices,
      createSessionServices: createSessionServices as any,
      skipUserSession: true,
    })

    console.log('\nActual execution order:')
    const execution2 = singletonServices.logger.getLogs()
    const beforeEvents2 = execution2.filter((e) => e.phase === 'before')
    if (beforeEvents2.length > 0) {
      beforeEvents2.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.name} (${event.type})`)
      })
    } else {
      console.log('  No middleware executed')
    }

    console.log('\n✓ HTTP middleware execution tests completed successfully')
    console.log(
      '\nNote: Scheduler, Queue, CLI, and MCP wirings are also configured'
    )
    console.log('with middleware. To test them, you would need to:')
    console.log('  - Scheduler: Run the cron scheduler')
    console.log('  - Queue: Enqueue and process jobs')
    console.log('  - CLI: Execute CLI commands')
    console.log('  - MCP: Invoke MCP tools through the protocol')
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
