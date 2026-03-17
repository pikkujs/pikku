---
name: pikku-pino
description: 'Use when setting up structured logging with Pino in a Pikku app. Covers PinoLogger setup and log levels.
TRIGGER when: code uses PinoLogger, user asks about structured logging, Pino, or @pikku/pino.
DO NOT TRIGGER when: user asks about ConsoleLogger (use pikku-services) or general service setup.'
---

# Pikku Pino (Structured Logging)

`@pikku/pino` provides structured JSON logging via [Pino](https://getpino.io/). Implements the `Logger` interface from `@pikku/core`.

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
- `info(messageOrObj: string | Record<string, any> | Error): void`
- `warn(messageOrObj: string | Record<string, any> | Error): void`
- `error(messageOrObj: string | Record<string, any> | Error): void`
- `debug(messageOrObj: string | Record<string, any>): void`

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
