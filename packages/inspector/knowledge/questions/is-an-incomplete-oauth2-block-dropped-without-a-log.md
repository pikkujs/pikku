---
type: question
title: Should an incomplete oauth2 block be dropped without a log?
description: An oauth2 block missing any required field is silently left undefined, and an empty scopes array passes the check
tags: [inspector, credentials, oauth]
---

# Should an incomplete oauth2 block be dropped without a log?

In `packages/inspector/src/add/add-credential.ts`, `oauth2` is set only when
`appCredentialSecretId`, `authorizationUrl`, `tokenUrl` and `scopes` are all truthy
(lines 144-155). There is no `else` branch, and nothing in that block calls the
logger. The credential is still recorded, with `oauth2` undefined.

`scopes` comes from `getArrayPropertyValue`, which returns `string[] | null`
(`packages/inspector/src/utils/get-property-value.ts:22`). An array literal returns
its string elements even when there are none (lines 31-35). An empty array is
truthy, so `scopes: []` passes the check.

Question: should a half-filled `oauth2` block be reported as critical, as the other
other validation in the same file is (logger calls at lines 49, 57 and 65)? And should `scopes: []` be
allowed to satisfy the check at all? The code currently does neither, and no
comment or test in this path says why.
