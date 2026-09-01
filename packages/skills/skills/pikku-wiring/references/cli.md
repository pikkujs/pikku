# Pikku CLI Wiring

## API Reference

### `wireCLI(config)`

All three factories come from `#pikku` (the generated types re-export
`cli/pikku-cli-types.gen.js`). Importing them from `@pikku/core/cli` compiles but
loses your project's service and middleware types.

```typescript
import { wireCLI } from '#pikku/cli'

wireCLI({
  program: string,              // Program name (e.g. 'todos')
  description?: string,
  summary?: string,
  options?: CLIOptions,         // Global options — see below
  render?: PikkuCLIRender,      // Default renderer for all commands
  middleware?: PikkuMiddleware[],
  tags?: string[],              // Targets tag middleware
  errors?: string[],
  auth?: boolean,               // Only affects the websocket backend, not local runs
  commands: {
    [name: string]: PikkuCLICommand | {
      description: string,
      subcommands: { [name: string]: PikkuCLICommand }
    }
  },
})
```

### `pikkuCLICommand(config)`

```typescript
import { pikkuCLICommand } from '#pikku/cli'

pikkuCLICommand({
  parameters?: string,          // Positional args (e.g. '<text>', '<username> <email>')
  func?: PikkuFunc,             // Business logic function — omit on a pure command group
  title?: string,
  description?: string,
  render?: PikkuCLIRender,      // Custom output renderer
  options?: CLIOptions,
  subcommands?: { [name: string]: PikkuCLICommand },  // nests to any depth
  middleware?: PikkuMiddleware[],
  permissions?: PermissionGroup,
  auth?: boolean,
  isDefault?: boolean,          // Runs when the group is invoked with no subcommand
})
```

`parameters` is checked against the func's input at compile time — a name that is
not a key of the input makes the type `never`, so a typo'd positional fails to
build rather than arriving as `undefined`.

### Options

```typescript
{
  description: string,
  short?: string,        // Single char alias (e.g. 'v')
  default?: any,
  choices?: any[],       // Restrict to these values
  array?: boolean,       // Collect every value up to the next flag
  required?: boolean,
}
```

How the parser reads them, which is worth knowing before you name one:

- **Flag names are camel-cased**, so `--api-url` and `--apiUrl` both fill `apiUrl`.
- **`--no-x` negation only works when `x` has a boolean `default`.** Without one,
  `--no-x` parses as an option literally named `noX` — which is why boolean flags
  should always declare their default.
- Short flags cluster (`-abc`), and only the last in a cluster may take a value.
- An unknown `--flag` warns rather than throwing.

### `pikkuCLIRender(fn)`

```typescript
import { pikkuCLIRender } from '#pikku/cli'

const renderer = pikkuCLIRender<OutputType>((services, data) => {
  // Format and print output to terminal
  console.log(data)
})
```

### Wire object (`wire.cli`)

```typescript
wire.cli.program // program name
wire.cli.command // string[] — the resolved command path
wire.cli.data // all positionals and options, merged
wire.cli.channel // the channel when served remotely (see below)
```

## Usage Patterns

### Basic Commands

```typescript
wireCLI({
  program: 'todos',
  commands: {
    add: pikkuCLICommand({
      parameters: '<text>',
      func: createTodo,
      description: 'Add a new todo',
      render: todoRenderer,
      options: {
        priority: {
          description: 'Set priority',
          short: 'p',
          default: 'normal',
          choices: ['low', 'normal', 'high'],
        },
      },
    }),
    list: pikkuCLICommand({
      func: listTodos,
      description: 'List all todos',
      render: todosRenderer,
      options: {
        completed: {
          description: 'Show completed only',
          short: 'c',
          default: false,
        },
      },
    }),
  },
})
// Usage: todos add "Buy milk" -p high
// Usage: todos list -c
```

### Nested Subcommands

```typescript
wireCLI({
  program: 'app',
  options: {
    verbose: { description: 'Verbose output', short: 'v', default: false },
  },
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: greetUser,
      render: greetRenderer,
    }),

    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: createUser,
          render: userRenderer,
          options: {
            admin: { description: 'Admin role', short: 'a', default: false },
          },
        }),
        list: pikkuCLICommand({
          func: listUsers,
          render: usersRenderer,
          options: {
            limit: { description: 'Max results', short: 'l' },
          },
        }),
      },
    },
  },
})
// Usage: app greet Alice
// Usage: app user create bob bob@example.com -a
// Usage: app user list -l 10
// Usage: app -v user list
```

### Custom Renderers

A renderer receives `(services, data)` where `data` is the func's output. Set `render` on `wireCLI` as the program-wide default; set `render` on a `pikkuCLICommand` to override it for that command.

```typescript
const todoRenderer = pikkuCLIRender<{ todo: Todo }>((_services, { todo }) => {
  console.log(`✓ Created: ${todo.text} (priority: ${todo.priority})`)
})

wireCLI({
  program: 'todos',
  render: jsonRenderer, // default for all commands
  commands: {
    add: pikkuCLICommand({ func: createTodo, render: todoRenderer }), // overrides jsonRenderer
  },
})
```

The func's input is the positional `parameters` plus `options`, merged (e.g. `parameters: '<username> <email>'` + an `admin` option → func input `{ username, email, admin }`).

A renderer's full signature is `(services, data, session?)`. It returns nothing —
printing is its job.

### Running the program over a websocket

Codegen emits a `<program>-channel.gen.ts` beside your wiring: a `wireChannel`
that serves the same commands remotely, so a local binary and a hosted session
run identical code. `auth` on `wireCLI` guards **that channel only** — a locally
executed CLI has no connection to authenticate, so it is not a way to require a
session for local runs. Don't hand-write or edit the generated channel file.

## Complete Example

For a full functions + renderers + nested-subcommand wiring walkthrough, see `cli-complete-example.md`.
