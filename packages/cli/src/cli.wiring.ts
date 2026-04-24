import { wireAddon } from '@pikku/core'
import { pikkuCommands, pikkuCLIOptions } from './cli.commands.js'
import { defaultCLIRenderer } from './services.js'
import { wireCLI } from '../.pikku/cli/pikku-cli-types.gen.js'

wireAddon({ name: 'cli', package: '@pikku/cli-addon' })

wireCLI({
  program: 'pikku',
  description:
    'Pikku CLI - Code generation tool for type-safe backend development',
  render: defaultCLIRenderer,
  options: pikkuCLIOptions,
  commands: { ...pikkuCommands },
})
