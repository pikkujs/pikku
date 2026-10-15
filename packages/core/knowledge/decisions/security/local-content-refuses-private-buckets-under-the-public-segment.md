---
type: decision
title: Local content refuses private buckets under the public segment and paths outside the root
description: The local content path resolver returns no target for a private bucket whose first segment is the public URL segment, for NUL bytes, and for any path resolving outside its visibility root
tags: core, content, security
---

# Local content refuses private buckets under the public segment and paths outside the root

The path resolver in `packages/core/src/services/local-content.ts:88-104` returns
`null` (no target) in four cases:

- the visibility is not one of the known visibilities (`:92`);
- the bucket or key contains a NUL byte (`:93`);
- the visibility is `private` and the bucket's first path segment is
  `PUBLIC_URL_SEGMENT` (`:94-96`);
- the scoped path or the final target resolves outside the visibility root
  (`:98-102`). `inside` accepts only the root itself or a path under `root + sep`.

**What this rules out:** reaching private content through the public URL segment,
and a bucket or key with `..` or an absolute component escaping the root.
