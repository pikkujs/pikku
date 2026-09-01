# AWS (`@pikku/aws-services`)

```bash
yarn add @pikku/aws-services
```

AWS-backed implementations of the content, queue, and secret interfaces.

## `S3Content` — ContentService

```typescript
import { S3Content } from '@pikku/aws-services'

const content = new S3Content(
  config: { bucketName: string; region: string; endpoint?: string },
  logger: Logger,
  signConfig: { keyPairId: string; privateKey: string }
)
```

`endpoint` is what points the client at LocalStack or an S3-compatible store.

Every method takes a single **args object**, matching the shared `ContentService`
interface. None of them are positional:

- `signURL({ url, dateLessThan, dateGreaterThan? }): Promise<string>` — CloudFront-sign an absolute URL
- `signContentKey({ bucket, contentKey, dateLessThan, dateGreaterThan? }): Promise<string>`
- `getUploadURL({ bucket, fileKey, contentType, visibility? }): Promise<{ uploadUrl, assetKey }>` — `visibility` is ignored
- `readFile({ bucket, key }): Promise<ReadableStream | NodeJS.ReadableStream>`
- `readFileAsBuffer({ bucket, key }): Promise<Buffer>`
- `writeFile({ bucket, key, stream }): Promise<boolean>`
- `copyFile({ bucket, key, fromAbsolutePath }): Promise<boolean>`
- `deleteFile({ bucket, key }): Promise<boolean>`

`signContentKey` builds `https://<bucketName>/<bucket>/<contentKey>` — it uses
`bucketName` as the **host**. For signed content that value must therefore be
your CloudFront domain, not a plain bucket name, which means the same config
field is doing two jobs.

Presigned upload URLs expire after a fixed **3600s**, not configurable through
the service.

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

## `SQSQueueService` — QueueService

```typescript
import { SQSQueueService } from '@pikku/aws-services'

const queue = new SQSQueueService({
  region: string,
  queueUrlPrefix: string, // e.g. 'https://sqs.us-east-1.amazonaws.com/123456789/'
  endpoint?: string,      // LocalStack or a custom SQS endpoint
})
```

- `add<T>(queueName: string, data: T, options?: JobOptions): Promise<string>` — returns SQS's `MessageId`
- `getJob()` — always **throws**

The queue URL is `queueUrlPrefix + queueName`, so the name in `wireQueueWorker`
has to match the SQS queue exactly.

Constraints inherited from SQS, enforced in `add`:

- `options.delay` is in **milliseconds**, floored to whole seconds. Over
  900_000ms (15 minutes) or negative throws before the message is sent.
- Standard queues only — no FIFO, so no `MessageGroupId` and no ordering
  guarantee.
- `data` is `JSON.stringify`d, which is where a `Date` or a `Map` quietly
  degrades.

```typescript
const createSingletonServices = pikkuServices(async (config) => {
  const queue = new SQSQueueService({
    region: config.awsRegion,
    queueUrlPrefix: config.sqsUrlPrefix,
  })
  return { config, queue }
})
```

## `AWSSecrets` — SecretService

```typescript
import { AWSSecrets } from '@pikku/aws-services'

const secrets = new AWSSecrets({ awsRegion: 'eu-west-2' })
```

`AWSConfig` has one field, `awsRegion` — there is no credentials option; the
SDK's default provider chain (instance role, env, profile) supplies those.

- `getSecret<T = string>(SecretId: string): Promise<SecretValue<T>>` — a JSON secret is parsed automatically, so pass a shape as `T` (a non-JSON value comes back as the raw string). The result is a branded `SecretValue`, not a bare value — reveal it where it is used rather than passing it through logs
- `getSecrets<T>(SecretIds: (keyof T & string)[]): Promise<Partial<T>>` — missing keys are omitted rather than thrown
- `hasSecret(SecretId: string): Promise<boolean>` — performs a full fetch
- `setSecret` / `deleteSecret` — **not implemented**; they throw
