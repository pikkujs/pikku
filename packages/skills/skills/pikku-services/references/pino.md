# Pikku Pino (Structured Logging)


## Installation

```bash
yarn add @pikku/pino
```

## API Reference

### `PinoLogger`

```typescript
import { PinoLogger } from '@pikku/pino'

const logger = new PinoLogger()
```

No constructor parameters. Creates a Pino logger instance.

**Properties:**

- `pino: pino.Logger` — Access the underlying Pino instance for advanced config.

**Methods:**

- `setLevel(level: LogLevel): void` — Set minimum log level.
- `info(messageOrObj: string | Record<string, any> | Error, ...meta): void`
- `warn(messageOrObj: string | Record<string, any> | Error, ...meta): void`
- `error(messageOrObj: string | Record<string, any> | Error, ...meta): void`
- `debug(message: string, ...meta): void` — string only; the object form is not accepted here

Every argument, first and trailing, is `Safe<>`-guarded. A `SecretValue` nested
anywhere in what you log collapses the call to `never` and it stops compiling.
An unrevealed secret would print as `[secret]` regardless — the guard is what
makes logging one a deliberate act rather than an accident.

`setLevel` maps Pikku's `LogLevel` enum onto Pino's own level strings, so pass
the enum (or its name) rather than a raw Pino level.

## Usage Patterns

### Basic Setup

```typescript
import { PinoLogger } from '@pikku/pino'

const logger = new PinoLogger()
logger.setLevel('debug')
```

### With Pikku Services

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  return { config, logger }
})
```

### Accessing Underlying Pino

```typescript
const logger = new PinoLogger()
logger.pino.child({ module: 'auth' }).info('Token verified')
```
