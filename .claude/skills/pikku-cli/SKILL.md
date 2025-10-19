---
name: pikku-cli
description: Wire Pikku functions as command-line interfaces with nested commands and custom renderers
tags: [pikku, cli, commands, terminal]
---

# Pikku CLI Wiring

This skill helps you wire Pikku functions to command-line interfaces with nested commands, positional parameters, options, and custom output renderers.

## Overview

CLI wiring transforms Pikku functions into command-line programs with:

- Nested commands and subcommands
- Positional parameters (`<required>` and `[optional]`)
- Named options/flags with short forms
- Custom output renderers for formatted console output
- Option inheritance from global → command → subcommand
- Smart type plucking (functions receive only declared options)

**Domain logic stays in `packages/functions/src/functions/**/*.function.ts`.**

## File Naming Rules

- CLI wiring files: `*.cli.ts`
- Render files: `*.render.ts` (optional, can be inline)
- One `wireCLI` per program (can have multiple programs)

Examples:

```
packages/functions/src/my-tool.cli.ts
packages/functions/src/utils.render.ts
```

## Imports

From wiring files:

✅ **Allowed:**

- `wireCLI`, `pikkuCLICommand` from `./pikku-types.gen.js`
- `pikkuCLIRender` from `@pikku/core`
- Exported Pikku functions from `./functions/**/*.function.ts`
- `middleware` from `./middleware.ts`
- `permissions` from `./permissions.ts`

❌ **Never:**

- Import from `./services/**`
- Implement business logic in wiring files

## Basic CLI Wiring

```typescript
import { wireCLI, pikkuCLICommand } from './pikku-types.gen.js'
import { pikkuCLIRender } from '@pikku/core'
import { greetUser } from './functions/greet.function.js'

wireCLI({
  program: 'my-tool',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: greetUser,
      description: 'Greet a user',
      options: {
        loud: {
          description: 'Use uppercase',
          short: 'l',
          default: false,
        },
      },
    }),
  },
})
```

**Usage:**

```bash
my-tool greet Alice
my-tool greet Alice --loud
my-tool greet Alice -l
```

## Positional Parameters

Use `<required>` and `[optional]` syntax in the `parameters` string:

```typescript
pikkuCLICommand({
  parameters: '<package> [version]', // package is required, version is optional
  func: installPackage,
})
```

**Positionals are mapped to function input:**

```typescript
type InstallInput = {
  package: string // from <package>
  version?: string // from [version]
}
```

## Options

Options are CLI flags/options with optional short forms:

```typescript
options: {
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
}
```

**Usage:**

```bash
my-tool install express --force
my-tool install express -f
my-tool install express --registry https://custom.registry
```

## Nested Commands (Subcommands)

Commands can have subcommands for hierarchical CLI structures:

```typescript
wireCLI({
  program: 'my-tool',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: createUser,
          description: 'Create a user',
        }),
        list: pikkuCLICommand({
          func: listUsers,
          description: 'List users',
        }),
      },
    },
  },
})
```

**Usage:**

```bash
my-tool user create alice alice@example.com
my-tool user list
```

## Renderers

Renderers transform function output for console display. Use `pikkuCLIRender` to create CLI-specific renderers.

See `examples/greet.render.ts` for renderer examples.

### Renderer Levels

1. **Command-specific renderer** - Defined on command
2. **Global renderer** - Defined on program (fallback)
3. **Default JSON renderer** - Built-in fallback

```typescript
// Global renderer (applies to all commands without specific renderer)
wireCLI({
  program: 'my-tool',
  render: pikkuCLIRender((services, output) => {
    console.log(JSON.stringify(output, null, 2))
  }),
  commands: {
    greet: pikkuCLICommand({
      func: greetUser,
      // Command-specific renderer (overrides global)
      render: pikkuCLIRender<{ message: string }>((_services, output) => {
        console.log(output.message)
      }),
    }),
  },
})
```

### Renderer Signature

```typescript
pikkuCLIRender<OutputType>(
  (services, output, session?) => {
    // Format and output to console
    console.log(...)
  }
)
```

- `services` - Singleton services (logger, config, etc.)
- `output` - Function output
- `session` - Optional user session (if `auth: true`)

## Option Inheritance

Options cascade from global → command → subcommand, with CLI arguments taking highest priority:

```typescript
wireCLI({
  program: 'my-tool',
  // Global options (inherited by all commands)
  options: {
    verbose: {
      description: 'Verbose output',
      short: 'v',
      default: false,
    },
  },
  commands: {
    install: pikkuCLICommand({
      func: installPackage,
      // Command options (inherited by subcommands)
      options: {
        force: {
          description: 'Force overwrite',
          short: 'f',
          default: false,
        },
      },
    }),
  },
})
```

**Resolution priority (highest to lowest):**

1. CLI arguments (`--verbose`, `-v`)
2. Command/subcommand defaults
3. Global defaults

## Smart Type Plucking

Functions only receive options they declare in their type signature:

```typescript
// Function declares what it needs
const installPackage = pikkuFunc<
  {
    package: string // positional
    version?: string // positional
    force?: boolean // option (plucked if available)
  },
  InstallResult
>({ ... })

// Available options through inheritance
// { verbose: boolean, force: boolean, registry: string }

// Function receives ONLY: { package, version?, force? }
// verbose and registry are NOT passed even though available
```

## Middleware and Permissions

Apply middleware and permissions to CLI commands:

```typescript
wireCLI({
  program: 'my-tool',
  // Global middleware (applies to all commands)
  middleware: [loggingMiddleware],
  commands: {
    deploy: pikkuCLICommand({
      func: deployApp,
      auth: true, // Requires authentication
      permissions: {
        admin: requireAdmin, // Requires admin permission
      },
      // Command-specific middleware
      middleware: [auditMiddleware],
    }),
  },
})
```

**Middleware must guard for CLI interaction:**

```typescript
const cliMetrics = pikkuMiddleware(async ({ logger }, interaction, next) => {
  if (!interaction.cli) {
    throw new InvalidMiddlewareInteractionError(
      'cliMetrics middleware can only be used with CLI interactions'
    )
  }

  logger.info('cli.command', {
    program: interaction.cli.program,
    command: interaction.cli.command.join(' '),
  })

  await next()
})
```

## Complete Example

See `examples/complete.cli.ts` for a full CLI program with:

- Nested commands
- Positional parameters
- Options with inheritance
- Custom renderers
- Middleware

## Channel Integration

CLI commands can use channels for real-time output (progress bars, streaming, etc.):

```typescript
const buildApp = pikkuFunc<BuildInput, BuildResult>({
  func: async ({ logger, channel }, data) => {
    // Stream progress updates via channel
    if (channel) {
      await channel.send({ type: 'progress', percent: 25 })
      await channel.send({ type: 'progress', percent: 50 })
      await channel.send({ type: 'progress', percent: 100 })
    }

    return { success: true }
  },
})

wireCLI({
  program: 'my-tool',
  commands: {
    build: pikkuCLICommand({
      func: buildApp,
      render: buildRenderer, // Can listen to channel messages
    }),
  },
})
```

The `interaction.cli` object contains:

- `program` - Program name
- `command` - Command path array (e.g., `['user', 'create']`)
- `data` - All positionals and options merged
- `channel` - PikkuChannel for real-time output

## Best Practices

1. **Keep functions transport-agnostic** - Functions should work via HTTP, CLI, or any transport
2. **Use renderers for formatting** - Don't console.log in functions, use renderers
3. **Leverage type inference** - Let TypeScript infer option types from function signatures
4. **Group related commands** - Use subcommands for logical grouping
5. **Provide descriptions** - Help text is generated from descriptions
6. **Use short forms** - Single-letter shortcuts for common options

## Examples

See the `examples/` directory for:

- Basic command wiring
- Nested commands with subcommands
- Custom renderers for different output formats
- Option inheritance and type plucking
- Middleware and permissions for CLI
