import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import '../.pikku/http/pikku-http-wirings-meta.gen.js' // Load HTTP metadata
import './functions/http.wiring.js' // Import HTTP wirings to register routes
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
    console.log('\nGenerated files:')
    console.log('  .pikku/pikku-middleware.gen.ts')
    console.log('  .pikku/http/pikku-http-wirings-meta.gen.ts')

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

    console.log('\n✓ Middleware execution completed successfully')
  } catch (e: any) {
    console.error('\n✗ Error:', e.toString())
    process.exit(1)
  }
}

main()
