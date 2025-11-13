#!/usr/bin/env node
import { Command } from 'commander'
import { createConfig, createSingletonServices } from '../src/services.js'
import { LocalVariablesService } from '@pikku/core/services'
import { all as allCommand } from '../src/functions/commands/all.js'
import { watch as watchCommand } from '../src/functions/commands/watch.js'

// Import bootstrap if it exists
try {
  await import('../.pikku/pikku-bootstrap.gen.js')
} catch {
  // Bootstrap doesn't exist yet, continue anyway
}

const action = async (command: string, cliConfig: any) => {
  const config = await createConfig(new LocalVariablesService(), cliConfig)
  const services = await createSingletonServices(config)
  const interaction = {}
  const data = null

  if (command === 'watch') {
    await watchCommand.func(services, interaction, data)
  } else {
    await allCommand.func(services, interaction, data)
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
    .option('-c, --config <string>', 'The path to pikku cli config file')
    .option('-t, --tags <tags...>', 'Which tags to filter by')
    .option(
      '--types <types...>',
      'Which types to filter by (http, channel, queue, scheduler, rpc, mcp)'
    )
    .option(
      '-d, --directories <directories...>',
      'Which directories to filter by'
    )
    .option(
      '-n, --names <names...>',
      'Filter functions by name patterns (supports wildcards)'
    )
    .option(
      '--httpMethods <methods...>',
      'Filter HTTP routes by methods (comma-separated)'
    )
    .option(
      '--httpRoutes <routes...>',
      'Filter HTTP routes by route patterns (comma-separated)'
    )
    .option('-s, --silent', 'Silent mode - only show critical errors')
    .option(
      '--info',
      'Show info messages and above (info, warn, error, critical)'
    )
    .option('--verbose', 'Show all debug messages (most detailed)')
    .option(
      '--loglevel <level>',
      'Set explicit log level (trace, debug, info, warn, error, critical)'
    )
    .option(
      '--state-output <path>',
      'Save inspector state to JSON file for reuse'
    )
    .option(
      '--state-input <path>',
      'Load inspector state from JSON file (skips inspection)'
    )
    .action((c) => action(name, c))
}

const program = new Command('pikku')
program.usage('[command]')

all(program, 'all', 'Generate all pikku wirings and files')
all(program, 'watch', 'Watch for changes in pikku files')

program.parse(process.argv)
