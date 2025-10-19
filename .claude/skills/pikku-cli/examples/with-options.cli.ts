import { wireCLI, pikkuCLICommand } from './pikku-types.gen.js'
import { installPackage } from './functions/install.function.js'
import { jsonRenderer } from './greet.render.js'

/**
 * Options and inheritance
 * Demonstrates global options, command options, and type plucking
 */

wireCLI({
  program: 'pkg-tool',
  description: 'Package manager CLI',

  // Global options (inherited by all commands)
  options: {
    config: {
      description: 'Configuration file path',
      short: 'c',
      default: './config.json',
    },
    verbose: {
      description: 'Enable verbose output',
      short: 'v',
      default: false,
    },
  },

  render: jsonRenderer,

  commands: {
    install: pikkuCLICommand({
      parameters: '<package> [version]',
      func: installPackage,
      description: 'Install a package',

      // Command-specific options (merged with global)
      options: {
        force: {
          description: 'Force overwrite existing package',
          short: 'f',
          default: false,
        },
        registry: {
          description: 'NPM registry URL',
          short: 'r',
          default: 'https://registry.npmjs.org',
        },
      },
    }),
  },
})

// Function receives ONLY the options it declares:
// type InstallInput = {
//   package: string      // positional
//   version?: string     // positional
//   force?: boolean      // plucked from options
//   verbose?: boolean    // plucked from global options
// }
// Note: config and registry are available but NOT passed to installPackage
// unless explicitly declared in InstallInput type

// Usage:
// pkg-tool install express
// pkg-tool install express 4.18.0
// pkg-tool install express --force
// pkg-tool install express -f -v
// pkg-tool install express --registry https://custom.registry
