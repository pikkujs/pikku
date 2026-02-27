---
name: pikku-cli
description: "Use when building CLI commands with Pikku. Covers wireCLI, pikkuCLICommand, subcommands, options, parameters, custom renderers, and nested command groups."
---

# Pikku CLI Wiring

Wire Pikku functions as CLI commands with parameters, options, subcommands, and custom terminal renderers.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their types
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireCLI(config)`

```typescript
import { wireCLI } from '@pikku/core/cli'

wireCLI({
  program: string,              // Program name (e.g. 'todos')
  options?: {                   // Global options
    [key: string]: {
      description: string,
      short?: string,           // Single char alias (e.g. 'v')
      default?: any,
    }
  },
  render?: PikkuCLIRender,      // Default renderer for all commands
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
import { pikkuCLICommand } from '@pikku/core/cli'

pikkuCLICommand({
  parameters?: string,          // Positional args (e.g. '<text>', '<username> <email>')
  func: PikkuFunc,              // Business logic function
  description?: string,
  render?: PikkuCLIRender,      // Custom output renderer
  options?: {
    [key: string]: {
      description: string,
      short?: string,
      default?: any,
      choices?: string[],       // Restrict to values
    }
  },
})
```

### `pikkuCLIRender(fn)`

```typescript
import { pikkuCLIRender } from '@pikku/core/cli'

const renderer = pikkuCLIRender<OutputType>(
  (services, data) => {
    // Format and print output to terminal
    console.log(data)
  }
)
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

```typescript
const todoRenderer = pikkuCLIRender<{ todo: Todo }>(
  (_services, { todo }) => {
    console.log(`✓ Created: ${todo.text} (priority: ${todo.priority})`)
  }
)

const todosRenderer = pikkuCLIRender<{ todos: Todo[] }>(
  (_services, { todos }) => {
    todos.forEach((t, i) => {
      const check = t.completed ? '✓' : ' '
      console.log(`  ${i + 1}. ${t.text}  ${check}`)
    })
  }
)

// Default renderer for program, override per-command
wireCLI({
  program: 'todos',
  render: jsonRenderer,
  commands: {
    add: pikkuCLICommand({
      func: createTodo,
      render: todoRenderer,  // Overrides jsonRenderer
    }),
  },
})
```

## Complete Example

```typescript
// functions/admin.functions.ts
export const createUser = pikkuFunc({
  title: 'Create User',
  func: async ({ db }, { username, email, admin }) => {
    const user = await db.createUser({ username, email, role: admin ? 'admin' : 'user' })
    return { user }
  },
})

export const listUsers = pikkuSessionlessFunc({
  title: 'List Users',
  func: async ({ db }, { limit }) => {
    return { users: await db.listUsers(limit || 50) }
  },
})

export const deleteUser = pikkuFunc({
  title: 'Delete User',
  func: async ({ db }, { username }) => {
    await db.deleteUser(username)
    return { deleted: username }
  },
})

// wirings/cli.wiring.ts
const userRenderer = pikkuCLIRender<{ user: User }>(
  (_services, { user }) => {
    console.log(`Created user: ${user.username} (${user.email}) [${user.role}]`)
  }
)

const usersRenderer = pikkuCLIRender<{ users: User[] }>(
  (_services, { users }) => {
    console.log(`Users (${users.length}):`)
    users.forEach(u => console.log(`  ${u.username} <${u.email}> [${u.role}]`))
  }
)

wireCLI({
  program: 'admin',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: createUser,
          render: userRenderer,
          options: {
            admin: { description: 'Create as admin', short: 'a', default: false },
          },
        }),
        list: pikkuCLICommand({
          func: listUsers,
          render: usersRenderer,
          options: {
            limit: { description: 'Max results', short: 'l' },
          },
        }),
        delete: pikkuCLICommand({
          parameters: '<username>',
          func: deleteUser,
          description: 'Delete a user',
        }),
      },
    },
  },
})
```
