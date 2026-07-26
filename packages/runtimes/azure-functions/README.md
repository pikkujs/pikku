# @pikku/azure-functions

Azure Functions runtime for Pikku — HTTP, timer and storage-queue handlers,
plus `AzureQueueService`.

## Install

```bash
npm install @pikku/azure-functions
```

## Usage

```typescript
import { app } from '@azure/functions'
import { createAzureHandler } from '@pikku/azure-functions'

import './.pikku/pikku-bootstrap.gen.js'

const handlers = createAzureHandler(factories, ['fetch'])

app.http('pikku', {
  route: '{*path}',
  authLevel: 'anonymous',
  handler: handlers.http,
})
```

`createAzureWorkerHandler` and `createAzureWebSocketHandler` cover queue and
WebSocket units. Use `@pikku/deploy-azure` to generate `host.json` and the
infra manifest.

## Docs

https://pikku.dev/docs
