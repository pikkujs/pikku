---
name: pikku-aws
description: 'Use when setting up AWS services (S3, SQS, Secrets Manager) in a Pikku app. Covers S3Content for file storage, SQSQueueService for queues, and AWSSecrets for secret management.
TRIGGER when: code uses S3Content, SQSQueueService, AWSSecrets, or user asks about AWS integration, S3 uploads, SQS queues, or AWS Secrets Manager with Pikku.
DO NOT TRIGGER when: user asks about AWS Lambda runtime (use pikku-deploy-lambda).'
---

# Pikku AWS Services

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/aws-services` provides AWS-backed implementations of Pikku's content, queue, and secret service interfaces.

## Installation

```bash
yarn add @pikku/aws-services
```

## API Reference

### `S3Content` (File Storage)

```typescript
import { S3Content } from '@pikku/aws-services'

const content = new S3Content(
  config: S3ContentConfig,
  logger: Logger,
  signConfig: { keyPairId: string; privateKey: string }
)
```

**Methods:**
- `signURL(url: string, dateLessThan: Date, dateGreaterThan?: Date): Promise<string>` — Sign a CloudFront URL
- `signContentKey(key: string, dateLessThan: Date, dateGreaterThan?: Date): Promise<string>` — Sign a content key
- `getUploadURL(Key: string, ContentType: string): Promise<{ uploadUrl, assetKey }>` — Get presigned upload URL
- `readFile(Key: string): Promise<ReadableStream>` — Read file as stream
- `readFileAsBuffer(Key: string): Promise<Buffer>` — Read file as buffer
- `writeFile(Key: string, stream: ReadableStream): Promise<boolean>` — Write file from stream
- `copyFile(Key: string, fromAbsolutePath: string): Promise<boolean>` — Copy local file to S3
- `deleteFile(Key: string): Promise<boolean>` — Delete file

### `SQSQueueService` (Queue)

```typescript
import { SQSQueueService } from '@pikku/aws-services'

const queue = new SQSQueueService(config: SQSQueueServiceConfig)
```

Implements `QueueService`. Note: `supportsResults = false` — job status tracking is not supported.

**Methods:**
- `add<T>(queueName: string, data: T, options?: JobOptions): Promise<string>` — Enqueue a message

### `AWSSecrets` (Secrets Manager)

```typescript
import { AWSSecrets } from '@pikku/aws-services'

const secrets = new AWSSecrets(config: AWSConfig)
```

**Methods:**
- `getSecret<R>(SecretId: string): Promise<R>` — Get a secret value
- `getSecretJSON<R>(SecretId: string): Promise<R>` — Get and parse a JSON secret
- `hasSecret(SecretId: string): Promise<boolean>` — Check if secret exists

## Usage Patterns

### S3 Content Service

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  const content = new S3Content(
    { bucket: config.s3Bucket, region: config.awsRegion },
    logger,
    { keyPairId: config.cfKeyPairId, privateKey: config.cfPrivateKey }
  )
  return { config, logger, content }
})
```

### SQS Queue

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const queue = new SQSQueueService({
    region: config.awsRegion,
    queueUrlPrefix: config.sqsUrlPrefix,
  })
  return { config, queue }
})
```
