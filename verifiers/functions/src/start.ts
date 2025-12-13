import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    await createSingletonServices(config)

    console.log('\nFunctions Verifier')
    console.log('==================')
    console.log(
      '\nThis verifier ensures all wiring types compile and load correctly.'
    )
    console.log('\nWiring types verified:')
    console.log(
      '  - HTTP: Basic routes, SSE, progressive enhancement, external, Zod'
    )
    console.log('  - Channel: WebSocket channels with message handlers')
    console.log('  - CLI: Command-line interface with commands and subcommands')
    console.log('  - MCP: Tools, Resources, and Prompts')
    console.log('  - Queue: Background job workers')
    console.log('  - Scheduler: Cron-based scheduled tasks')
    console.log('  - RPC: Remote procedure calls')
    console.log('  - Workflow: Graph-based workflows')

    console.log('\n\n✓ All wirings loaded successfully!')
  } catch (e: any) {
    console.error('\n✗ Error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
