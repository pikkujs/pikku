---
name: pikku-backblaze
description: 'Use when setting up Backblaze B2 file storage in a Pikku app. Covers B2Content for file uploads, downloads, and signed URLs.
TRIGGER when: code uses B2Content, user asks about Backblaze B2, or @pikku/backblaze.
DO NOT TRIGGER when: user asks about S3 storage (use pikku-aws).'
---

# Pikku Backblaze (B2 Content Storage)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

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
