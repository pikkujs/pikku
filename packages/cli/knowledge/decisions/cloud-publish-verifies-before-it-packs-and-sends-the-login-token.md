---
type: decision
title: pikku cloud publish verifies the addon before packing, and sends the logged-in token only to the registry
description: The publish function runs addon verification first, requires a stored login and package name and version, then uploads through a presigned URL that carries no auth header
tags: cli, cloud, publish, registry, auth
---

# pikku cloud publish verifies the addon before packing, and sends the logged-in token only to the registry

`CloudPublish` in `packages/cli/src/cloud/functions/publish.function.ts` runs its
checks in order before anything is uploaded.

It calls `CloudAddonVerify` first and throws `CloudPreconditionError` when the
result is not ok (`publish.function.ts:38-44`). Then it resolves the API context and
requires a stored token, or it refuses with "Not logged in. Run `pikku cloud login`
first." (`publish.function.ts:46-53`). It requires `package.json` with a name and a
version (`publish.function.ts:55-66`).

Packing is by `npm pack` into a temporary directory (`publish.function.ts:72-80`).
The API requests carry `Authorization: Bearer <token>` (`publish.function.ts:82-85`).
The upload is a PUT to the presigned URL with no extra headers
(`publish.function.ts:105-107`). The comment says the signature covers the host only,
so added headers would break it. The token therefore goes to the API calls and not
to the storage URL.

**What this rules out:** publishing an addon that failed verification, publishing
without a stored login, and sending the bearer token to the presigned upload URL.
