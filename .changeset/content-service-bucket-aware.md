---
'@pikku/core': major
'@pikku/aws-services': major
'@pikku/backblaze': major
'@pikku/addon-workflow-screenshot': major
---

feat(content)!: bucket-aware ContentService with typed object args

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
