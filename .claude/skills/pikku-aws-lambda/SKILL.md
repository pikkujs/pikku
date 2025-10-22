---
name: pikku-aws-lambda
description: Deploy Pikku functions to AWS Lambda with serverless framework. Use for serverless architectures, pay-per-use pricing, automatic scaling, and event-driven applications.
tags: [pikku, aws, lambda, serverless, runtime, deployment]
---

# Pikku AWS Lambda Runtime

This skill helps you deploy Pikku functions to AWS Lambda using the Serverless Framework.

## When to use this skill

- Serverless architecture (no servers to manage)
- Pay-per-use pricing model
- Automatic scaling (0 to millions of requests)
- Event-driven applications (HTTP, SQS, scheduled tasks)
- Cost optimization (only pay when functions execute)
- Quick deployments with serverless framework
- Integration with AWS services (S3, DynamoDB, SQS, etc.)

**Performance note:** Lambda has cold start latency. Use cold start optimization patterns for production.

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/lambda @pikku/core @pikku/aws-services
npm install -D serverless serverless-offline esbuild @types/aws-lambda
```

### 2. Create Handler Files

**Standalone:** Create `src/main.ts` or separate handlers (`src/http.ts`, `src/scheduled.ts`) based on [templates/aws-lambda](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/src/main.ts)

**Workspace:** Create handlers in `src/` based on [workspace-starter/backends/aws-lambda](https://github.com/vramework/examples/blob/main/workspace-starter/backends/aws-lambda/src/http.ts)

**Key imports:**
- Import bootstrap (see [pikku-project-setup](/skills/pikku-project-setup) for correct path)
- Import handler functions from `@pikku/lambda/http` or `@pikku/lambda/scheduler`
- Import config, services, and session factory
- Implement cold start optimization pattern

### 3. Configure Serverless Framework

Create `serverless.yml` with functions, events, and esbuild configuration:
- HTTP functions → API Gateway events
- Scheduled functions → EventBridge/CloudWatch Events
- Queue functions → SQS events

**Template:** [templates/aws-lambda/serverless.yml](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/serverless.yml)

**Critical:** Configure esbuild with `--external:"@aws-sdk/*"` to exclude AWS SDK from bundle.

### 4. Implement Cold Start Optimization

```typescript
let config: Config
let singletonServices: SingletonServices

export const coldStart = async () => {
  if (!config) config = await createConfig()
  if (!singletonServices) singletonServices = await createSingletonServices(config)
  return singletonServices
}
```

### 5. Update Package.json Scripts

```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "serverless offline start",
    "deploy": "serverless deploy",
    "deploy:function": "serverless deploy function -f"
  }
}
```

### 6. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start local development with serverless-offline
npm run dev

# Verify endpoint
curl http://localhost:3000/your-endpoint
```

**Expected outcome:** Serverless Offline starts local API Gateway simulation, endpoints respond correctly, cold start optimization caches services between invocations.

---

## Installation

```bash
npm install @pikku/lambda @pikku/core @pikku/aws-services
npm install -D serverless serverless-offline esbuild @types/aws-lambda
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/aws-lambda/src/main.ts](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/src/main.ts)

**Key points:**
- Import bootstrap from local `./.pikku/pikku-bootstrap.gen.js`
- Import services from local files
- Use cold start pattern to cache singleton services
- Export handler functions for each Lambda function
- Configure serverless.yml for deployment

### Workspace - No Backend Config (Simpler)

Backend imports functions from the functions package.

**Example:** [workspace-starter/backends/aws-lambda/src/http.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/aws-lambda/src/http.ts)

**Key differences:**
- Import config/services from functions package: `@my-app/functions/src/config`
- Import bootstrap from functions: `@my-app/functions/.pikku/pikku-bootstrap.gen`
- No `pikku` script needed in backend package.json
- Uses functions package filters

**Tradeoffs:**
- ✅ Faster: No extra build step per backend
- ✅ Simpler: One source of truth
- ❌ Can't customize filtering (uses functions package filters)

### Workspace - With Backend Config (Filtered)

Backend has its own `pikku.config.json` with custom filters.

**Backend pikku.config.json:**
```json
{
  "extends": "../../packages/functions/pikku.config.json",
  "filters": {
    "types": ["http", "scheduler"],
    "tags": ["api", "lambda"],
    "excludeTags": ["edge-only", "websocket"]
  }
}
```

**Bootstrap import:**
```typescript
// Import from backend's .pikku directory (custom filters)
import '../.pikku/pikku-bootstrap.gen'
```

**Build process:**
1. `cd backends/aws-lambda`
2. `yarn pikku` (reads local pikku.config.json, applies custom filters)
3. Generated files in `backends/aws-lambda/.pikku/` include only filtered functions

**Tradeoffs:**
- ✅ Custom filtering: Different API subsets per backend
- ✅ Tree-shaking: Better bundle size per backend
- ✅ Runtime-specific: Exclude incompatible functions per backend
- ❌ Slower: Must run `pikku` per backend

---

## Handler Types

### HTTP Handlers

Handle API Gateway HTTP events.

**Standalone:**
```typescript
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { createSessionServices } from './services.js'
import { coldStart } from './cold-start.js'

import './.pikku/pikku-bootstrap.gen.js'

export const httpRoute = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await runFetch(singletonServices, createSessionServices, event)
}
```

**Workspace with CORS:**
```typescript
import { APIGatewayProxyEvent } from 'aws-lambda'
import { corsHTTP, corslessHTTP } from '@pikku/lambda/http'
import { createSessionServices } from '@my-app/functions/src/services'
import { coldStart } from './cold-start.js'

import '@my-app/functions/.pikku/pikku-bootstrap.gen'

export const corslessHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corslessHTTP(event, singletonServices, createSessionServices)
}

export const corsHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corsHTTP(event, [], singletonServices, createSessionServices)
}
```

### Scheduled Tasks

Handle CloudWatch Events (cron).

```typescript
import { ScheduledHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { coldStart } from './cold-start.js'

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
    singletonServices,
  })
}
```

### SQS Queue Workers

Handle SQS messages.

```typescript
import { SQSHandler } from 'aws-lambda'
import { runSQSQueueWorker } from '@pikku/lambda/queue'
import { createSessionServices } from './services.js'
import { coldStart } from './cold-start.js'

export const mySQSWorker: SQSHandler = async (event) => {
  const singletonServices = await coldStart()
  await runSQSQueueWorker(singletonServices, createSessionServices, event)
}
```

---

## Cold Start Optimization

Lambda functions experience cold starts when not recently invoked. Cache singleton services to minimize initialization time.

**Pattern:**
```typescript
import { AWSSecrets } from '@pikku/aws-services'
import { createConfig, createSingletonServices } from './services.js'

let config: Config
let singletonServices: SingletonServices

export const coldStart = async () => {
  if (!config) {
    config = await createConfig()
  }
  if (!singletonServices) {
    singletonServices = await createSingletonServices(config, {
      secrets: new AWSSecrets(config),
    })
  }
  return singletonServices
}
```

**Key points:**
- Cache config and singletonServices at module level
- Only initialize once per Lambda container
- Reduces latency on subsequent invocations
- Use AWSSecrets service for AWS Secrets Manager integration

**See:** [templates/aws-lambda/src/cold-start.ts](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/src/cold-start.ts)

---

## WebSocket Support

Lambda supports WebSocket connections via API Gateway WebSocket API.

**Example:** [workspace-starter/backends/aws-lambda-websocket/src/websocket.ts](https://github.com/vramework/examples/blob/main/workspace-starter/backends/aws-lambda-websocket/src/websocket.ts)

**Required services:**
- `LambdaEventHubService`: Manages WebSocket connections
- `KyselyChannelStore`: Stores channel subscriptions (requires database)
- `KyselyEventHubStore`: Stores WebSocket connection info

**Handlers:**
```typescript
import { APIGatewayProxyHandler } from 'aws-lambda'
import {
  connectWebsocket,
  disconnectWebsocket,
  processWebsocketMessage,
  LambdaEventHubService,
} from '@pikku/lambda/websocket'

export const connectHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  await connectWebsocket(event, params)
  return { statusCode: 200, body: '' }
}

export const disconnectHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  return await disconnectWebsocket(event, params)
}

export const defaultHandler: APIGatewayProxyHandler = async (event) => {
  const params = await getParams(event)
  return await processWebsocketMessage(event, params)
}
```

**Note:** WebSocket support requires database for connection tracking.

---

## Serverless Framework Configuration

**serverless.yml:**
```yaml
service: my-pikku-app

plugins:
  - serverless-offline

provider:
  name: aws
  runtime: nodejs20.x
  stage: production
  region: us-east-1
  environment:
    NODE_OPTIONS: --enable-source-maps
    NODE_ENV: production

functions:
  http:
    handler: dist/main.httpRoute
    events:
      - http:
          path: /{proxy+}
          method: any

  cron:
    handler: dist/main.myScheduledTask
    events:
      - schedule: rate(1 day)

  sqs:
    handler: dist/main.mySQSWorker
    events:
      - sqs:
          arn:
            Fn::GetAtt:
              - MyQueue
              - Arn

resources:
  Resources:
    MyQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: my-queue
```

**See:** [templates/aws-lambda/serverless.yml](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/serverless.yml)

---

## Build Configuration

Use esbuild for fast bundling and minification.

**package.json:**
```json
{
  "scripts": {
    "build": "esbuild ./src/main.ts --format=esm --minify --external:\"@aws-sdk/*\" --bundle --keep-names --sourcemap --platform=node --target=node20 --outdir=dist --out-extension:.js=.mjs",
    "start": "npm run build && serverless offline",
    "deploy": "npm run build && serverless deploy"
  }
}
```

**Key flags:**
- `--format=esm`: ES modules
- `--minify`: Reduce bundle size
- `--external:"@aws-sdk/*"`: Don't bundle AWS SDK (provided by Lambda runtime)
- `--bundle`: Single file output
- `--keep-names`: Preserve function names for debugging
- `--sourcemap`: Generate source maps
- `--out-extension:.js=.mjs`: Output .mjs files

**See:** [templates/aws-lambda/package.json](https://github.com/vramework/pikku/blob/main/templates/aws-lambda/package.json)

---

## Development

### Scripts

**Standalone:**
```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "build": "esbuild ...",
    "start": "npm run build && serverless offline",
    "deploy": "npm run build && serverless deploy"
  }
}
```

**Workspace (no backend config):**
```json
{
  "scripts": {
    "build": "esbuild ...",
    "start": "yarn build && serverless offline",
    "deploy": "yarn build && serverless deploy"
  }
}
```

**Workspace (with backend config):**
```json
{
  "scripts": {
    "pikku": "pikku",
    "prebuild": "npm run pikku",
    "build": "esbuild ...",
    "start": "yarn build && serverless offline",
    "deploy": "yarn build && serverless deploy"
  }
}
```

### Local Development

Use `serverless-offline` to test Lambda functions locally:

```bash
npm run start
# Server runs at http://localhost:3000
```

**Note:** serverless-offline emulates API Gateway + Lambda locally.

---

## Deployment

Deploy to AWS using Serverless Framework:

```bash
# Deploy to AWS
npm run deploy

# Deploy to specific stage
serverless deploy --stage production --region us-east-1

# Deploy single function (faster)
serverless deploy function --function http

# View logs
serverless logs --function http --tail

# Remove deployment
serverless remove
```

**AWS Credentials:**
Configure AWS credentials via environment variables or `~/.aws/credentials`:

```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
```

---

## Performance Tips

- **Cold start optimization**: Cache singleton services, minimize bundle size
- **Memory configuration**: Higher memory = more CPU (test 512MB, 1024MB, etc.)
- **Provisioned concurrency**: Eliminate cold starts for critical functions (costs more)
- **Lambda layers**: Share common dependencies across functions
- **Bundle size**: Use esbuild minification and tree-shaking
- **Database connections**: Use connection pooling (AWS RDS Proxy)

---

## Examples

**Standalone:**
- [templates/aws-lambda](https://github.com/vramework/pikku/tree/main/templates/aws-lambda) - HTTP, cron, SQS
- [templates/aws-lambda-websocket](https://github.com/vramework/pikku/tree/main/templates/aws-lambda-websocket) - WebSocket

**Workspace:**
- [workspace-starter/backends/aws-lambda](https://github.com/vramework/examples/tree/main/workspace-starter/backends/aws-lambda) - Workspace HTTP backend
- [workspace-starter/backends/aws-lambda-websocket](https://github.com/vramework/examples/tree/main/workspace-starter/backends/aws-lambda-websocket) - Workspace WebSocket backend

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from local: `'./.pikku/pikku-bootstrap.gen.js'`
- [ ] Import services from local files: `'./services.js'`
- [ ] Implement cold start optimization
- [ ] Export handler functions for each Lambda function
- [ ] Use esbuild for bundling
- [ ] External AWS SDK packages in esbuild config

### Workspace (No Backend Config)

- [ ] Import config/services from functions: `'@my-app/functions/src/...'`
- [ ] Import bootstrap from functions: `'@my-app/functions/.pikku/pikku-bootstrap.gen'`
- [ ] Backend package.json has `"@my-app/functions": "workspace:*"`
- [ ] No `pikku` script needed

### Workspace (With Backend Config)

- [ ] Backend has `pikku.config.json` with `extends`
- [ ] Import bootstrap from backend: `'../.pikku/pikku-bootstrap.gen'`
- [ ] Backend package.json includes `"pikku": "pikku"` script
- [ ] Backend package.json includes `"@pikku/cli"` in devDependencies
- [ ] Run `pikku` in backend directory to generate filtered wiring

### Cold Start Optimization

- [ ] Cache config and singletonServices at module level
- [ ] Use `AWSSecrets` service for AWS Secrets Manager
- [ ] Minimize bundle size with esbuild
- [ ] Use provisioned concurrency for critical functions

### Deployment

- [ ] Configure AWS credentials
- [ ] Use serverless-offline for local development
- [ ] Test with different memory configurations
- [ ] Monitor cold start metrics in CloudWatch
- [ ] Use CloudWatch Logs for debugging

### WebSocket

- [ ] Use `LambdaEventHubService` for WebSocket support
- [ ] Implement `KyselyChannelStore` and `KyselyEventHubStore`
- [ ] Separate handlers for connect, disconnect, default
- [ ] Requires database for connection tracking

---

## Related Skills

**Prerequisites:**
- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**
- [pikku-http](/skills/pikku-http) - HTTP route wiring and configuration
- [pikku-scheduler](/skills/pikku-scheduler) - Scheduled task configuration
- [pikku-queue](/skills/pikku-queue) - SQS queue function definitions

**Service Integration:**
- [pikku-aws-services](/skills/pikku-aws-services) - AWS SDK integration (Secrets Manager, DynamoDB, S3, SQS)

**Alternative Runtimes:**
- [pikku-cloudflare](/skills/pikku-cloudflare) - Edge computing alternative
- [pikku-express](/skills/pikku-express) - Traditional server deployment
- [pikku-fastify](/skills/pikku-fastify) - Traditional server deployment
