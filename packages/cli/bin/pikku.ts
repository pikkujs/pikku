#!/usr/bin/env node

// // Check if the generated CLI exists
// if (existsSync(generatedCLIPath)) {
//   // Use the generated Pikku CLI (supports all options including --names, --httpMethods, etc.)
//   const { PikkuCLI } = await import(generatedCLIPath)
//   PikkuCLI().catch((error) => {
//     console.error('Fatal error:', error.message)
//     process.exit(1)
//   })
// } else {
// Fallback to Commander-based CLI for bootstrap (during initial build)
const { Command } = await import('commander')
const { createConfig, createSingletonServices } = await import(
  '../src/services.js'
)
const { PikkuRPCService } = await import('@pikku/core')
const { LocalVariablesService } = await import('@pikku/core/services')

// Import bootstrap if it exists
try {
  await import('../.pikku/pikku-bootstrap.gen.js')
} catch {
  // Bootstrap doesn't exist yet, continue anyway
}

const action = async (command, cliConfig) => {
  const config = await createConfig(new LocalVariablesService(), cliConfig)
  const services = await createSingletonServices(config)
  const rpcWrapper = new PikkuRPCService()
  const { rpc } = await rpcWrapper.injectRPCService(services, {}, false)

  if (command === 'watch') {
    await rpc.invoke('watch', null)
  } else {
    await rpc.invoke('all', null)
  }
}

const all = (program, name, description) => {
  program
    .command(name, { isDefault: name === 'all' })
    .description(description)
    .option('--pikku-config-type', 'The type of your pikku config object')
    .option(
      '--singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '--session-services-factory-type',
      'The type of your session services factory'
    )
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .option('-t | --tags <tags...>', 'Which tags to filter by')
    .option(
      '--types <types...>',
      'Which types to filter by (http, channel, queue, scheduler, rpc, mcp)'
    )
    .option('--directories <directories...>', 'Which directories to filter by')
    .option('-s | --silent', 'Silent mode - only show errors')
    .action((c) => action(name, c))
}

const program = new Command('pikku')
program.usage('[command]')

all(program, 'all', 'Generate all pikku wirings and files')
all(program, 'watch', 'Watch for changes in pikku files')

program.parse(process.argv)
// }
