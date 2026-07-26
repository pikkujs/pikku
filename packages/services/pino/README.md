# @pikku/pino

[Pino](https://getpino.io) logger for Pikku, implementing the core `Logger`
interface.

## Install

```bash
npm install @pikku/pino pino
```

## Usage

```typescript
import { PinoLogger } from '@pikku/pino'

const logger = new PinoLogger()
logger.setLevel('info')
```

The underlying Pino instance is exposed as `logger.pino`.

## Docs

https://pikku.dev/docs
