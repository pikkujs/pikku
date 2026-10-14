---
type: decision
title: Signed uploads are verified by the same check as signed reads
description: The local content handler refuses an upload whose presigned URL does not verify, using the same exported verifier that signed reads use
tags: core, content, security
---

# Signed uploads are verified by the same check as signed reads

`verifySignedContentRequest` in
`packages/core/src/services/local-content-request-handler.ts:60-72` is the one
function that decides whether a signed read or a signed upload is genuine. It is
exported so every runtime that serves content verifies the same way.

The handler's `validateSignedAssetRequest` wraps it (`:146-149`).
`handleUpload` calls that wrapper before writing anything and returns the failure
response when the check does not pass (`:157-169`). The comment at `:162-165`
gives the reason: without the check, an unauthenticated PUT could write to any
key under the content root.

The existing note `signed-content-urls-bind-the-request-path.md` covers the read
side and the node server verifier; this note covers the upload path in the core
handler.

**What this rules out:** writing an upload key before its signed URL has verified,
and a separate upload check that could drift from the read check.
