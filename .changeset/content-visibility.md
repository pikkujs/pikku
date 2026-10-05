---
'@pikku/core': patch
'@pikku/aws-services': patch
'@pikku/backblaze': patch
'@pikku/node-http-server': patch
'@pikku/express': patch
---

Content services support `visibility: 'private' | 'public'` (default private). `ContentService` gains `getDownloadURL`, `deleteByPrefix` and `listFilesByPrefix`. `LocalContent` stores under `private/` and `public/` and serves public files unsigned at `<assetUrlPrefix>/_public/<bucket>/<key>`; unprefixed files from before still read as private, and a private bucket may not be named `_public`. S3 makes public objects `public-read` per object (the bucket must allow ACLs), Backblaze uses `publicBucketId` when set, and the scoped addon content service passes visibility through and keeps the new methods inside the addon's folder.
