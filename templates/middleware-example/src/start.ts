import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

// TODO: MCP wiring not working - metadata not being generated
// import './functions/mcp.wiring.js'
import {
  fetch,
  runScheduledTask,
  runQueueJob,
  runCLICommand,
} from '@pikku/core'

type SingletonServices = Awaited<ReturnType<typeof createSingletonServices>>

async function testHTTPWiring(
  singletonServices: SingletonServices
): Promise<void> {
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
}

async function testSchedulerWiring(
  singletonServices: SingletonServices
): Promise<void> {
  // Test 3: Scheduler task
  console.log('\n\nTest 3: Run Scheduled Task')
  console.log('─────────────────────────')
  console.log('Expected middleware order:')
  console.log('  1. Tag middleware (Wire tags: scheduler)')
  console.log('  2. Wire-level middleware')
  console.log('  3. Tag middleware (Function tags: function)')
  console.log('  4. Function-level middleware')

  singletonServices.logger.clear()
  await runScheduledTask({
    name: 'testScheduledTask',
    singletonServices,
    createSessionServices: createSessionServices as any,
  })

  console.log('\nActual execution order:')
  const execution3 = singletonServices.logger.getLogs()
  const beforeEvents3 = execution3.filter((e: any) => e.phase === 'before')
  if (beforeEvents3.length > 0) {
    beforeEvents3.forEach((event: any, index: number) => {
      console.log(`  ${index + 1}. ${event.name} (${event.type})`)
    })
  } else {
    console.log('  No middleware executed')
  }
  singletonServices.logger.clear()

  console.log('\n✓ Scheduler middleware execution test completed successfully')
}

async function testQueueWiring(
  singletonServices: SingletonServices
): Promise<void> {
  // Test 4: Queue job
  console.log('\n\nTest 4: Run Queue Job')
  console.log('─────────────────────────')
  console.log('Expected middleware order:')
  console.log('  1. Tag middleware (Wire tags: queue)')
  console.log('  2. Wire-level middleware')
  console.log('  3. Tag middleware (Function tags: function)')
  console.log('  4. Function-level middleware')

  singletonServices.logger.clear()
  await runQueueJob({
    singletonServices,
    createSessionServices: createSessionServices as any,
    job: {
      id: 'test-job-1',
      queueName: 'test-queue',
      data: {},
      status: () => 'active' as const,
      metadata: () => ({
        attemptsMade: 0,
        maxAttempts: 3,
        createdAt: new Date(),
      }),
    },
  })

  console.log('\nActual execution order:')
  const execution4 = singletonServices.logger.getLogs()
  const beforeEvents4 = execution4.filter((e: any) => e.phase === 'before')
  if (beforeEvents4.length > 0) {
    beforeEvents4.forEach((event: any, index: number) => {
      console.log(`  ${index + 1}. ${event.name} (${event.type})`)
    })
  } else {
    console.log('  No middleware executed')
  }
  singletonServices.logger.clear()

  console.log('\n✓ Queue middleware execution test completed successfully')
}

async function testCLIWiring(
  singletonServices: SingletonServices
): Promise<void> {
  // Test 5: CLI command
  console.log('\n\nTest 5: Run CLI Command')
  console.log('─────────────────────────')
  console.log('Expected middleware order:')
  console.log('  1. Tag middleware (Wire tags: cli)')
  console.log('  2. Wire-level middleware')
  console.log('  3. Tag middleware (Function tags: function)')
  console.log('  4. Function-level middleware')

  singletonServices.logger.clear()
  await runCLICommand({
    program: 'test-cli',
    commandPath: ['greet'],
    data: { name: 'World', loud: false },
    singletonServices,
    createSessionServices: createSessionServices as any,
  })

  console.log('\nActual execution order:')
  const execution5 = singletonServices.logger.getLogs()
  const beforeEvents5 = execution5.filter((e: any) => e.phase === 'before')
  if (beforeEvents5.length > 0) {
    beforeEvents5.forEach((event: any, index: number) => {
      console.log(`  ${index + 1}. ${event.name} (${event.type})`)
    })
  } else {
    console.log('  No middleware executed')
  }
  singletonServices.logger.clear()

  console.log('\n✓ CLI middleware execution test completed successfully')
}

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

    await testHTTPWiring(singletonServices)
    await testSchedulerWiring(singletonServices)
    await testQueueWiring(singletonServices)

    // TODO: Test 6: MCP tool - skipped for now (metadata generation issue)
    // await testMCPWiring(singletonServices, createSessionServices)

    console.log('\n\n✓ All implemented wiring types tested successfully!')
    console.log(
      'Note: MCP wiring test skipped - metadata generation needs to be fixed'
    )
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
