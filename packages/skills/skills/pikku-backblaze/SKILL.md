---
name: pikku-backblaze
description: >-
  Use when setting up Backblaze B2 file storage in a Pikku app. Covers B2Content for file uploads,
  downloads, and signed URLs. TRIGGER when: code uses B2Content, user asks about Backblaze B2, or
  @pikku/backblaze. DO NOT TRIGGER when: user asks about S3 storage (use pikku-aws).
---

# Pikku Backblaze (B2 Content Storage)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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

`B2ContentConfig` has exactly three fields — `applicationKeyId`, `applicationKey`
and `bucketId`. There is no `cdnUrl`: downloads are served from the `downloadUrl`
B2 returns at authorization.

**Methods** — every one takes a single **args object**, matching the shared
`ContentService` interface. None of them are positional:

- `signContentKey({ bucket, contentKey, dateLessThan }): Promise<string>` — a full download URL with an `Authorization` query param
- `signURL({ url, dateLessThan }): Promise<string>` — re-signs an existing `/file/` URL; a URL with no `/file/` segment is returned untouched
- `getUploadURL({ bucket, fileKey, contentType, visibility? }): Promise<UploadURLResult>` — `visibility` is ignored by this backend
- `writeFile({ bucket, key, stream }): Promise<boolean>`
- `copyFile({ bucket, key, fromAbsolutePath }): Promise<boolean>`
- `readFile({ bucket, key }): Promise<ReadableStream | NodeJS.ReadableStream>`
- `readFileAsBuffer({ bucket, key }): Promise<Buffer>`
- `deleteFile({ bucket, key }): Promise<boolean>`

### One real bucket, logical buckets as prefixes

The `bucket` on every call is a **logical** bucket stored as a path prefix
(`${bucket}/${key}`) inside the single B2 bucket named by `bucketId`. Don't
provision a B2 bucket per logical bucket — the config takes only one.

### Behaviours worth knowing before you rely on them

- **Writes are buffered in memory.** `writeFile` drains the whole stream into a
  `Buffer` before uploading, because B2's upload endpoint needs a SHA-1 and a
  content length up front. Large uploads should go through `getUploadURL` and be
  sent by the client directly.
- **`getUploadURL` sets `X-Bz-Content-Sha1: do_not_verify`**, since the server
  can't hash a body it never sees. The client-side upload is unverified.
- **Write paths swallow failures.** `writeFile`, `copyFile` and `deleteFile` log
  and return `false` rather than throwing; the read paths and the signing paths
  throw. Check the boolean — an ignored return is a silently lost file.
- Authorization and the bucket-name lookup are cached on the instance for its
  lifetime, so a rotated application key needs a new `B2Content`.

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
    },
    logger
  )
  return { config, logger, content }
})
```

```typescript
await content.writeFile({ bucket: 'avatars', key: `${userId}.png`, stream })
const url = await content.signContentKey({
  bucket: 'avatars',
  contentKey: `${userId}.png`,
  dateLessThan: new Date(Date.now() + 60_000),
})
```
