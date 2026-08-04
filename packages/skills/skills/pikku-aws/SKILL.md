---
name: pikku-aws
description: >-
  Use when setting up AWS services (S3, SQS, Secrets Manager) in a Pikku app. Covers S3Content for
  file storage, SQSQueueService for queues, and AWSSecrets for secret management. TRIGGER when:
  code uses S3Content, SQSQueueService, AWSSecrets, or user asks about AWS integration, S3
  uploads, SQS queues, or AWS Secrets Manager with Pikku. DO NOT TRIGGER when: user asks about AWS
  Lambda runtime (use pikku-deploy-lambda).
---

# Pikku AWS Services

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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
  config: { bucketName: string; region: string; endpoint?: string },
  logger: Logger,
  signConfig: { keyPairId: string; privateKey: string }
)
```

`endpoint` is what points the client at LocalStack or an S3-compatible store.

**Methods** — every one takes a single **args object**, matching the shared
`ContentService` interface. None of them are positional:

- `signURL({ url, dateLessThan, dateGreaterThan? }): Promise<string>` — CloudFront-sign an absolute URL
- `signContentKey({ bucket, contentKey, dateLessThan, dateGreaterThan? }): Promise<string>`
- `getUploadURL({ bucket, fileKey, contentType, visibility? }): Promise<{ uploadUrl, assetKey }>` — `visibility` is ignored
- `readFile({ bucket, key }): Promise<ReadableStream | NodeJS.ReadableStream>`
- `readFileAsBuffer({ bucket, key }): Promise<Buffer>`
- `writeFile({ bucket, key, stream }): Promise<boolean>`
- `copyFile({ bucket, key, fromAbsolutePath }): Promise<boolean>`
- `deleteFile({ bucket, key }): Promise<boolean>`

### One real bucket, logical buckets as prefixes

The `bucket` on every call is a **logical** bucket stored as a path prefix
(`${bucket}/${key}`) inside the single S3 bucket named by `bucketName`. Don't
provision an S3 bucket per logical bucket — the config takes only one.

### Behaviours worth knowing before you rely on them

- **`signURL` fails open.** A signing error is logged and the *unsigned* URL is
  returned rather than thrown. If your CloudFront distribution is private the
  client then gets a 403; if it isn't, you have just handed out an unrestricted
  link. Check that `signConfig` is a valid CloudFront key pair at boot.
- **`signContentKey` builds `https://<bucketName>/<bucket>/<contentKey>`** — it
  uses `bucketName` as the *host*. For signed content the value must therefore be
  your CloudFront domain, not a plain bucket name, which also means the same
  config field is doing two jobs.
- **Presigned upload URLs expire after a fixed 3600s.** It is not configurable
  through the service.
- **Write paths swallow failures.** `writeFile`, `copyFile` and `deleteFile` log
  and return `false` rather than throwing; the read paths throw. Check the
  boolean.

### `SQSQueueService` (Queue)

```typescript
import { SQSQueueService } from '@pikku/aws-services'

const queue = new SQSQueueService({
  region: string,
  queueUrlPrefix: string, // e.g. 'https://sqs.us-east-1.amazonaws.com/123456789/'
  endpoint?: string,      // LocalStack or a custom SQS endpoint
})
```

Implements `QueueService`. Note: `supportsResults = false` — job status tracking is not supported.

**Methods:**

- `add<T>(queueName: string, data: T, options?: JobOptions): Promise<string>` — Enqueue a message; returns SQS's `MessageId`
- `getJob()` — always **throws**. SQS is fire-and-forget; reach for BullMQ or PgBoss when you need the result back.

The queue URL is `queueUrlPrefix + queueName`, so the queue name in `wireQueueWorker` has to match the SQS queue exactly.

Constraints inherited from SQS, enforced in `add`:

- `options.delay` is in **milliseconds** and is floored to whole seconds. Over
  900_000ms (15 minutes) or negative throws before the message is sent.
- Standard queues only — no FIFO, so no `MessageGroupId` and no ordering
  guarantee.
- `data` is `JSON.stringify`d, which is where a `Date` or a `Map` quietly
  degrades.

### `AWSSecrets` (Secrets Manager)

```typescript
import { AWSSecrets } from '@pikku/aws-services'

const secrets = new AWSSecrets({ awsRegion: 'eu-west-2' })
```

`AWSConfig` has one field, `awsRegion` — there is no credentials option; the SDK's
default provider chain (instance role, env, profile) supplies those.

**Methods:**

- `getSecret<T = string>(SecretId: string): Promise<SecretValue<T>>` — a JSON secret is parsed automatically, so pass a shape as `T` (a non-JSON value comes back as the raw string). The result is a branded `SecretValue`, not a bare value — reveal it where it is used rather than passing it through logs
- `getSecrets<T>(SecretIds: (keyof T & string)[]): Promise<Partial<T>>` — Batch fetch; missing keys are omitted rather than thrown
- `hasSecret(SecretId: string): Promise<boolean>` — Check if secret exists
- `setSecret` / `deleteSecret` — **not implemented** for `AWSSecrets`; it throws. Manage AWS secrets out of band.

Every `getSecret` failure — missing secret, denied permission, a secret holding
only binary — surfaces as the same `FATAL: Error finding secret: <id>`, with the
real reason on the error's `cause`. Read `cause` before concluding the secret
doesn't exist. `hasSecret` performs a full fetch and returns `false` for any
error, so it can't distinguish "absent" from "not allowed" either.

## Usage Patterns

### S3 Content Service

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  const content = new S3Content(
    { bucketName: config.s3Bucket, region: config.awsRegion },
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
