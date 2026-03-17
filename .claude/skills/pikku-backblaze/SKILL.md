---
name: pikku-backblaze
description: 'Use when setting up Backblaze B2 file storage in a Pikku app. Covers B2Content for file uploads, downloads, and signed URLs.
TRIGGER when: code uses B2Content, user asks about Backblaze B2, or @pikku/backblaze.
DO NOT TRIGGER when: user asks about S3 storage (use pikku-aws).'
---

# Pikku Backblaze (B2 Content Storage)

`@pikku/backblaze` provides Backblaze B2-backed file storage implementing the `ContentService` interface.

## Installation

```bash
yarn add @pikku/backblaze
```

## API Reference

### `B2Content`

```typescript
import { B2Content } from '@pikku/backblaze'

const content = new B2Content(
  config: B2ContentConfig,
  logger: Logger
)
```

**Methods:**
- `signContentKey(key: string, dateLessThan: Date): Promise<string>` — Sign a content key
- `signURL(url: string, dateLessThan: Date): Promise<string>` — Sign a URL
- `getUploadURL(fileKey: string, contentType: string): Promise<{ uploadUrl, assetKey, uploadMethod?, uploadHeaders? }>` — Get upload URL
- `writeFile(assetKey: string, stream: ReadableStream): Promise<boolean>` — Write file
- `copyFile(assetKey: string, fromAbsolutePath: string): Promise<boolean>` — Copy local file to B2
- `readFile(assetKey: string): Promise<ReadableStream>` — Read file as stream
- `readFileAsBuffer(assetKey: string): Promise<Buffer>` — Read file as buffer
- `deleteFile(fileName: string): Promise<boolean>` — Delete file

## Usage Patterns

```typescript
import { B2Content } from '@pikku/backblaze'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new PinoLogger()
  const content = new B2Content(
    {
      applicationKeyId: config.b2KeyId,
      applicationKey: config.b2AppKey,
      bucketId: config.b2BucketId,
      cdnUrl: config.b2CdnUrl,
    },
    logger
  )
  return { config, logger, content }
})
```
