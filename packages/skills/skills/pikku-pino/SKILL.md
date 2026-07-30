---
name: pikku-pino
description: >-
  Use when setting up structured logging with Pino in a Pikku app. Covers PinoLogger setup and log
  levels. TRIGGER when: code uses PinoLogger, user asks about structured logging, Pino, or
  @pikku/pino. DO NOT TRIGGER when: user asks about ConsoleLogger (use pikku-services) or general
  service setup.
---

# Pikku Pino (Structured Logging)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
