# CLI Wiring Feature Specification

## Overview

Create a new `wireCLI` system that enables developers to expose Pikku functions as command-line interfaces with automatic parameter parsing, validation, and flexible rendering. The system follows the established wiring patterns in Pikku while providing CLI-specific features like nested commands, option inheritance, and smart type plucking.

## Core Design Principles

1. **Positional Arguments**: Defined in command strings using `<required>` and `[optional]` syntax
2. **Flag Options**: Defined in option objects with type-safe `pikkuCLIOptions<T>()` helper
3. **Inheritance with Override**: Options cascade from global → command → subcommand, with leaf values winning
4. **Smart Type Plucking**: Functions only receive the options they declare in their type signature
5. **Flexible Rendering**: Transform function outputs for display using renderers
6. **Consistent with Existing Patterns**: Follows established Pikku wiring architecture

## Core Types

### Renderer Type (in `packages/core/src/types/core.types.ts`)

```typescript
// Generic renderer type that can be reused across different wirings
export type CorePikkuRender<
  Data,
  Output,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: Data,
  session?: Session
) => Output | Promise<Output>

// Factory function for type safety
export const pikkuRender = <
  Data,
  Output,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
>(
  renderer: CorePikkuRender<Data, Output, Services, Session>
): CorePikkuRender<Data, Output, Services, Session> => {
  return renderer
}
```

### CLI-Specific Renderer (in `packages/core/src/wirings/cli/cli.types.ts`)

```typescript
// CLI-specific renderer that outputs to console and returns void
export type CorePikkuCLIRender<
  Data,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
> = CorePikkuRender<Data, void, Services, Session>

// CLI-specific factory for clarity
export const pikkuCLIRender = <
  Data,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
>(
  renderer: (
    services: Services,
    data: Data,
    session?: Session
  ) => void | Promise<void>
): CorePikkuCLIRender<Data, Services, Session> => {
  return renderer
}
```

## API Design

### Basic Structure

```typescript
wireCLI({
  // Global options inherited by all commands
  options: pikkuCLIOptions<{ config: string; verbose: boolean }>({
    config: {
      description: 'Configuration file path',
      short: 'c',
      default: './config.json'
    },
    verbose: {
      description: 'Verbose output',
      short: 'V',
      default: false
    }
  }),

  // Global middleware
  middleware: [authMiddleware, loggingMiddleware],

  // Global renderer (default for all commands)
  render: pikkuCLIRender<any>((services, data) => {
    console.log(JSON.stringify(data, null, 2));
  }),

  // Command tree
  commands: {
    commandName: {
      command: 'commandName <required> [optional]',  // positional pattern
      func: pikkuFunc | pikkuSessionlessFunc,
      render: pikkuCLIRender<OutputType>(...),       // optional command-specific renderer
      description: 'Command description',
      options: pikkuCLIOptions<T>({...}),
      middleware: [...],
      subcommands: {
        // Nested commands with same structure
      }
    }
  }
})
```

### Complete Example

```typescript
// Function definitions with explicit type requirements
const installPackageFunc: pikkuFunc<
  {
    package: string // from <package> positional
    version?: string // from [version] positional
    force?: boolean // from --force flag
    verbose?: boolean // from --verbose flag (inherited)
  },
  { installed: string; path: string }
> = async (services, data, session) => {
  if (data.verbose) {
    services.logger.info(
      `Installing ${data.package}@${data.version || 'latest'}`
    )
  }
  return { installed: data.package, path: '/node_modules/' + data.package }
}

const listPackagesFunc: pikkuFunc<
  {
    filter?: string // from --filter flag
    verbose?: boolean // from --verbose flag (inherited)
  },
  Array<{ name: string; version: string; path: string }>
> = async (services, data, session) => {
  const packages = await services.packageManager.list()
  return packages.filter((p) => !data.filter || p.name.includes(data.filter))
}

// CLI-specific renderers
const installRenderer = pikkuCLIRender<{ installed: string; path: string }>(
  (services, output) => {
    console.log(`✓ Successfully installed ${output.installed}`)
    console.log(`  Location: ${output.path}`)
  }
)

const listRenderer = pikkuCLIRender<Array<{ name: string; version: string }>>(
  async (services, packages) => {
    if (packages.length === 0) {
      console.log('No packages found')
      return
    }

    console.log('Installed packages:')
    console.table(
      packages.map((p) => ({
        Package: p.name,
        Version: p.version,
      }))
    )
  }
)

// Wire the CLI
wireCLI({
  options: pikkuCLIOptions<{ config: string; verbose: boolean }>({
    config: {
      description: 'Configuration file',
      short: 'c',
      default: './config.json',
    },
    verbose: {
      description: 'Verbose output',
      short: 'V',
      default: false,
    },
  }),

  // Default renderer for commands without specific renderers
  render: pikkuCLIRender<any>((services, data) => {
    console.log(JSON.stringify(data, null, 2))
  }),

  commands: {
    install: {
      command: 'install <package> [version]',
      func: installPackageFunc,
      render: installRenderer, // Custom renderer for install
      description: 'Install a package',

      options: pikkuCLIOptions<{ force: boolean; registry: string }>({
        force: {
          description: 'Force overwrite',
          short: 'f',
          default: false,
        },
        registry: {
          description: 'NPM registry URL',
          short: 'r',
          default: 'https://registry.npmjs.org',
        },
      }),

      subcommands: {
        list: {
          func: listPackagesFunc,
          render: listRenderer, // Table renderer for list
          description: 'List installed packages',
          options: pikkuCLIOptions<{ filter: string }>({
            filter: {
              description: 'Filter packages by name',
              short: 'F',
              default: '',
            },
          }),
        },
      },
    },
  },
})
```

## Renderer Examples

```typescript
// Simple text renderer
const textRenderer = pikkuCLIRender<{ message: string }>((services, output) => {
  console.log(output.message)
})

// Progress renderer
const progressRenderer = pikkuCLIRender<{
  current: number
  total: number
  task: string
}>((services, output) => {
  const percent = Math.round((output.current / output.total) * 100)
  const bar = '█'.repeat(percent / 5)
  const empty = '░'.repeat(20 - percent / 5)
  console.log(`${output.task}: [${bar}${empty}] ${percent}%`)
})

// Error-aware renderer
const resultRenderer = pikkuCLIRender<{
  success: boolean
  error?: string
  result?: any
}>(async (services, output) => {
  if (!output.success) {
    console.error(`❌ Operation failed: ${output.error}`)
    process.exit(1)
  } else {
    console.log('✓ Success')
    if (output.result) {
      console.log(JSON.stringify(output.result, null, 2))
    }
  }
})

// Conditional verbose renderer
const verboseRenderer = pikkuCLIRender<any>((services, output, session) => {
  // Access to services allows checking configuration
  if (services.config.verbose) {
    console.log('Detailed output:')
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('Operation completed')
  }
})
```

## Option Resolution

### Priority Order (Highest to Lowest)

1. **CLI Arguments**: User-provided flags always win
2. **Leaf Options**: Most specific (deepest) command level
3. **Parent Options**: Intermediate command levels
4. **Global Options**: Root level defaults

### Example Resolution

```bash
# Command: mycli install package express --force --verbose

# Resolution chain:
1. Global defaults:    { config: './config.json', verbose: false }
2. Command options:    { force: false, registry: 'https://registry.npmjs.org' }
3. CLI arguments:      { force: true, verbose: true }

# Final merged options:
{
  config: './config.json',
  verbose: true,          # CLI arg override
  force: true,            # CLI arg override
  registry: 'https://registry.npmjs.org'
}

# installPackageFunc receives (based on its type signature):
{
  package: 'express',     # positional
  force: true,            # plucked from merged options
  verbose: true           # plucked from merged options
}
# Note: registry and config are available but NOT passed
```

## Type System

### Option Type Helper

```typescript
// Type-safe option definition
function pikkuCLIOptions<T>(options: {
  [K in keyof T]: {
    description: string
    short?: string
    default?: T[K]
    choices?: T[K][] // for enums
    array?: boolean // for array types
  }
}): CLIOptions<T>
```

### Type Plucking

Functions only receive the options they declare in their type signature:

```typescript
// Available options through inheritance
type AvailableOptions = {
  force: boolean
  registry: string
  config: string
  verbose: boolean
  timeout: number
}

// Function declares what it needs
type FunctionInput = {
  package: string // positional
  version?: string // positional
  force?: boolean // plucked if present
  verbose?: boolean // plucked if present
}

// Runtime plucks matching keys
// Registry, config, timeout are NOT passed even though available
```

## Implementation Architecture

### CLI Types (`packages/core/src/wirings/cli/cli.types.ts`)

```typescript
import { CorePikkuRender } from '../../types/core.types.js'

export interface CoreCLI<Commands, Options, Middleware, Output = any> {
  commands: Commands
  options?: Options
  middleware?: Middleware[]
  render?: CorePikkuCLIRender<Output> // Default renderer
}

export interface CLICommand<Func, Output, Options, Middleware, Subcommands> {
  command?: string // Position pattern: "install <package> [version]"
  func: Func
  render?: CorePikkuCLIRender<Output> // Command-specific renderer
  description?: string
  options?: Options
  middleware?: Middleware[]
  subcommands?: Subcommands
  auth?: boolean
  permissions?: Permissions
}

export interface CLIWiringMeta {
  command: string
  positionals: {
    name: string
    required: boolean
    variadic?: boolean
  }[]
  options: Record<string, CLIOption>
  pikkuFuncName: string
  renderName?: string // Reference to renderer if defined
  subcommands?: Record<string, CLIWiringMeta>
}
```

### CLI Runner (`packages/core/src/wirings/cli/cli-runner.ts`)

```typescript
export const wireCLI = <...>(cli: CoreCLI<...>) => {
  // Store metadata
  const cliMeta = buildCLIMetadata(cli);
  pikkuState('cli', 'meta', cliMeta);

  // Store renderers
  if (cli.render) {
    pikkuState('cli', 'defaultRenderer', cli.render);
  }

  // Register functions and renderers
  registerCLICommands(cli.commands);
}

async function executeCLICommand(
  funcName: string,
  services: Services,
  input: any,
  session?: Session
) {
  // 1. Execute the function
  const output = await runPikkuFunc(funcName, services, input, session);

  // 2. Get the renderer (command-specific or default)
  const renderer = getCommandRenderer(funcName) || getDefaultRenderer();

  // 3. Execute renderer if present
  if (renderer) {
    await Promise.resolve(renderer(services, output, session));
  } else {
    // Fallback: plain console.log
    console.log(JSON.stringify(output, null, 2));
  }

  return output;
}
```

## Execution Flow

1. **Parse Command Line**: Extract command, positionals, and flags
2. **Resolve Command Path**: Navigate command tree to find target function
3. **Merge Options**: Combine options through inheritance chain (leaf wins)
4. **Parse Positionals**: Extract values based on command pattern
5. **Get Function Schema**: Retrieve expected input types
6. **Pluck Options**: Select only options the function expects
7. **Validate Data**: Check against function schema
8. **Execute Function**: Call with plucked and validated data
9. **Render Output**: Apply renderer to function output (if defined)

## Transport Modes

### Local Execution

Direct function execution in the same process with immediate rendering

### HTTP Backend

```typescript
const response = await fetch('/cli/execute', {
  method: 'POST',
  body: JSON.stringify({
    command: 'install.package',
    data: { package: 'express', version: '5.0.0', force: true },
  }),
})
const output = await response.json()
// Apply local renderer to remote output
if (renderer) {
  await renderer(services, output, session)
}
```

## Benefits

1. **Type Safety**: Full TypeScript support with type inference
2. **Smart Plucking**: Functions only receive needed options
3. **Clean Separation**: Positionals vs flags clearly distinguished
4. **Flexible Rendering**: Customizable output formatting per command
5. **Option Inheritance**: Natural cascading with override
6. **Existing Integration**: Leverages Pikku's schema and validation
7. **Developer Experience**: IntelliSense and compile-time checking

## Migration Path

Existing HTTP/RPC functions can be easily exposed as CLI commands:

- Add `wireCLI` wrapper around existing functions
- Define command patterns for positional arguments
- Add optional renderers for better CLI output
- Options automatically derived from function signatures
- No changes needed to function implementations
