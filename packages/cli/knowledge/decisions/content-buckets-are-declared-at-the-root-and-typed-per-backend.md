---
type: decision
title: Content buckets are declared at the root and typed per backend
description: root content declares the directory, size limit and every bucket; backends.<name>.content lists the buckets that backend may use plus its own route prefixes; pikku all writes a ContentBucket type per backend; content is closed by default
tags: cli, config, content, codegen, types
---

# Content buckets are declared at the root and typed per backend

```json
"content": { "contentPath": "files", "sizeLimit": "10mb", "buckets": ["shop", "ingest"] },
"backends": {
  "api":  { "content": { "buckets": ["shop"], "assetUrlPrefix": "/content" } },
  "jobs": { "content": { "buckets": ["ingest"] } }
}
```

- The root block holds what is shared: the directory (`contentPath`), the size
  limit and `buckets`, every bucket that exists.
- A backend's block holds the buckets that backend may use and its own
  `uploadUrlPrefix` / `assetUrlPrefix`, because each backend is its own server
  on its own port. `contentPath` and `sizeLimit` inside a backend are refused
  naming the root as their home.
- Closed by default: a backend with no `content` has no content access, so its
  `ContentBucket` is `never`.

## What the loader refuses

`assertContentConfig` (`src/utils/content-buckets.ts`), after the key check:

- a backend bucket that is not in the root `content.buckets`;
- a backend `content` when the project has no root `content.buckets`;
- a backend `content` without `buckets`, and an empty list at either level;
- duplicate or invalid names. A bucket is one directory under the content root
  (`LocalContent.safePath` refuses a climb out of it and a leading `_public`),
  and it becomes a TypeScript string literal, so it is one segment of letters,
  digits, `.`, `_` or `-`, not starting with `.` or `-`, and not `_public`.

## Enforcement is the type

`pikku all` writes `.pikku/backends/<name>/content-buckets.gen.ts` for each
backend (`generateBackendCodegen`), exporting `type ContentBucket = 'a' | 'b'`
(`never` with no buckets) and the `contentBuckets` array. An app declares
`content: ContentService<ContentBucket>` in its application types, importing
from its backend's file; a bucket the backend does not list is then a compile
error (`src/utils/content-buckets.type.test.ts`; `templates/online-shop`).
Services shared by several backends type against the backend they are built for.

`pikku dev` and `pikku serve` resolve the local content service from the root
(directory, limit) and the selected backend (prefixes); `--backend` picks it.

## Deferred

- No runtime allowlist: the check is TypeScript-only, so code that casts past
  the type still reaches any bucket.
- No bucket mapping for addons, and `globalContent` is untouched.
