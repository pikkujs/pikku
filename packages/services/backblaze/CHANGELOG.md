# @pikku/backblaze

## 0.12.6

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.5

### Patch Changes

- 66d1b4f: feat(content)!: bucket-aware ContentService with typed object args

  BREAKING CHANGE: All `ContentService` methods now take object args with a
  required `bucket` field. The interface is generic over `TBucket extends string`
  so callers can constrain bucket names to a typed union.

  Migration:

  ```ts
  // Before
  content.getUploadURL(fileKey, contentType)
  content.signContentKey(key, expiresAt)
  content.writeFile(assetKey, stream)
  content.readFile(assetKey)
  content.deleteFile(assetKey)

  // After
  content.getUploadURL({ bucket, fileKey, contentType })
  content.signContentKey({ bucket, contentKey, dateLessThan: expiresAt })
  content.writeFile({ bucket, key, stream })
  content.readFile({ bucket, key })
  content.deleteFile({ bucket, key })
  ```

  - New exported types: `SignContentKeyArgs`, `SignURLArgs`, `GetUploadURLArgs`,
    `UploadURLResult`, `BucketKeyArgs`, `WriteFileArgs`, `CopyFileArgs`.
  - `LocalContent` stores objects under `<base>/<bucket>/<key>`.
  - `S3Content` and `B2Content` treat the logical bucket as a key prefix within
    the configured underlying storage bucket.
  - `workflow-screenshot` addon takes `bucket?` / `key?` input; default bucket
    resolved from `PIKKU_WORKFLOW_SCREENSHOT_BUCKET` variable, no hardcoded
    fallback.

- Updated dependencies [18acebe]
- Updated dependencies [66d1b4f]
- Updated dependencies [3e35b99]
  - @pikku/core@0.12.20

## 0.12.4

### Patch Changes

- 912453b: Compute SHA1 content hash for server-side uploads instead of using do_not_verify. Implement time-limited signed URLs via B2's download authorization API for signContentKey and signURL.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
