# @pikku/lambda

AWS Lambda runtime for Pikku — HTTP (API Gateway v1 and v2), WebSocket, SQS
queue and scheduled handlers, plus `SQSQueueService`.

## Install

```bash
npm install @pikku/lambda
```

## Usage

```typescript
import { runFetchV2 } from '@pikku/lambda'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

import './.pikku/pikku-bootstrap.gen.js'

export const handler = async (event: APIGatewayProxyEventV2) =>
  runFetchV2(event)
```

Use `@pikku/deploy-serverless` to generate the matching `serverless.yml`.

## Docs

https://pikku.dev/docs
