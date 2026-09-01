# Backblaze B2 (`@pikku/backblaze`)

```bash
yarn add @pikku/backblaze
```

`B2Content` implements `ContentService` over Backblaze B2.

```typescript
import { B2Content } from '@pikku/backblaze'

const content = new B2Content(config: B2ContentConfig, logger: Logger)
```

`B2ContentConfig` has exactly three fields — `applicationKeyId`, `applicationKey`
and `bucketId`. There is no `cdnUrl`: downloads are served from the `downloadUrl`
B2 returns at authorization.

Every method takes a single **args object**, matching the shared `ContentService`
interface. None of them are positional:

- `signContentKey({ bucket, contentKey, dateLessThan }): Promise<string>` — a full download URL with an `Authorization` query param
- `signURL({ url, dateLessThan }): Promise<string>` — re-signs an existing `/file/` URL; a URL with no `/file/` segment is returned untouched
- `getUploadURL({ bucket, fileKey, contentType, visibility? }): Promise<UploadURLResult>` — `visibility` is ignored
- `writeFile({ bucket, key, stream }): Promise<boolean>`
- `copyFile({ bucket, key, fromAbsolutePath }): Promise<boolean>`
- `readFile({ bucket, key }): Promise<ReadableStream | NodeJS.ReadableStream>`
- `readFileAsBuffer({ bucket, key }): Promise<Buffer>`
- `deleteFile({ bucket, key }): Promise<boolean>`

Because `writeFile` drains the whole stream into a `Buffer` before uploading
(B2's upload endpoint needs a SHA-1 and a content length up front), large uploads
should go through `getUploadURL` and be sent by the client directly.

```typescript
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
