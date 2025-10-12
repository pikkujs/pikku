import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import './.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const singletonServices = await createSingletonServices(config)

    console.log('\nMiddleware Example')
    console.log('==================')
    console.log('\nThis example demonstrates middleware generation.')
    console.log('\nGenerated files:')
    console.log('  .pikku/pikku-middleware.gen.ts')
    console.log('\nMiddleware layers:')
    console.log('  - Global middleware (via addMiddleware)')
    console.log('  - HTTP middleware (via addHTTPMiddleware)')
    console.log(
      '  - Route pattern middleware (via addHTTPMiddleware with pattern)'
    )
    console.log('  - Wire-level middleware (in wireHTTP)')
    console.log('  - Function-level middleware (in funcMiddleware)')
    console.log('\nRun tests with: npm test')
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
