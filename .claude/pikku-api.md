# Pikku API Documentation

## Function Signatures

### pikkuSessionlessFunc

```typescript
// Direct function:
pikkuSessionlessFunc<InputType, OutputType>(
  async (services, data) => { ... }
)

// With config:
pikkuSessionlessFunc<InputType, OutputType>({
  func: async (services, data) => { ... },
  auth: false,
  expose: boolean,
  middleware: PikkuMiddleware[],
  permissions: PikkuPermission[],
  name: string
})

// Services parameter is destructured:
async ({ logger, config, variables }, data: InputType) => OutputType

// Example:
pikkuSessionlessFunc<{ name: string }, { success: boolean }>(
  async ({ logger }, data) => {
    logger.info(data.name)
    return { success: true }
  }
)
```

### pikkuFunc

```typescript
// Direct function:
pikkuFunc<InputType, OutputType>(
  async (services, data, session) => { ... }
)

// With config:
pikkuFunc<InputType, OutputType>({
  func: async (services, data, session) => { ... },
  auth: boolean,
  expose: boolean,
  middleware: PikkuMiddleware[],
  permissions: PikkuPermission[],
  name: string
})

// Services parameter is destructured:
async ({ logger, config, variables }, data: InputType, session: Session) => OutputType

// Example:
pikkuFunc<{ userId: string }, { user: User }>(
  async ({ logger }, data, session) => {
    logger.info(data.userId)
    return { user: session.user }
  }
)
```

### pikkuMiddleware

```typescript
pikkuMiddleware(
  async (services, interaction, next) => {
    // Do work before
    await next()
    // Do work after
  }
)

// Services parameter is destructured:
async ({ logger }, interaction, next) => void
```

### pikkuPermission

```typescript
pikkuPermission(async (services, data, session) => {
  return true // or false
})

// Services parameter is destructured:
;async ({ logger }, data, session) => boolean
```

## Wiring Functions

### wireCLI

```typescript
wireCLI({
  program: string,
  commands: {
    commandName: pikkuCLICommand({ ... }),
    // or nested:
    group: {
      description: string,
      subcommands: { ... }
    }
  },
  options?: Record<string, {
    description: string,
    short: string,
    default: any
  }>,
  render?: (services, output, session?) => void | Promise<void>,
  description?: string
})
```

### pikkuCLICommand

```typescript
pikkuCLICommand({
  command: string,           // e.g. "greet <name>"
  func: pikkuFunc | pikkuSessionlessFunc,
  description?: string,
  render?: (services, output, session?) => void | Promise<void>,
  options?: Record<string, {
    description?: string,
    short?: string,
    default?: any
  }>,
  subcommands?: Record<string, any>,
  auth?: boolean,
  permissions?: any[]
})
```

## Examples

### Simple Sessionless Function

```typescript
const myCommand = pikkuSessionlessFunc(
  async ({ logger }, data: { name: string }) => {
    logger.info(`Hello ${data.name}`)
    return { success: true }
  }
)
```

### Function with Config

```typescript
const myCommand = pikkuSessionlessFunc({
  func: async ({ logger }, data: { name: string }) => {
    logger.info(`Hello ${data.name}`)
    return { success: true }
  },
  auth: false,
  expose: true,
})
```

### CLI Wiring

```typescript
wireCLI({
  program: 'pikku',
  commands: {
    all: pikkuCLICommand({
      command: 'all',
      func: allCommand,
      description: 'Generate all files',
      options: {
        config: {
          description: 'Path to config file',
          short: 'c',
        },
        watch: {
          description: 'Watch mode',
          short: 'w',
          default: false,
        },
      },
    }),
  },
})
```
