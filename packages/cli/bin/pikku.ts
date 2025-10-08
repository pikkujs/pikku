#!/usr/bin/env node
import { Command } from 'commander'
import { createSingletonServices } from '../src/services.js'
import { Config, SingletonServices } from '../types/application-types.js'
import { PikkuRPCService } from '../../core/src/wirings/rpc/rpc-runner.js'
import { TypedPikkuRPC } from '../.pikku/rpc-internal/pikku-rpc-wirings-map.internal.gen.js'

export const action = async (
  command: string,
  config: Config
): Promise<void> => {
  const services = await createSingletonServices(config)
  const rpcWrapper = new PikkuRPCService<SingletonServices, TypedPikkuRPC>()
  const { rpc } = await rpcWrapper.injectRPCService(services)

  if (command === 'watch') {
    await rpc.invoke('watch', null)
  } else {
    await rpc.invoke('all', null)
  }
}

export const all = (
  program: Command,
  name: string,
  description: string
): void => {
  program
    .command(name, { isDefault: true })
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
