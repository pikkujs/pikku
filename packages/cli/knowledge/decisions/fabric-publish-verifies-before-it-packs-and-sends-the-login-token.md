---
type: decision
title: fabric publish verifies the addon before packing, and sends the logged-in token only to the registry
description: The publish function runs addon verification first, requires a stored login and package name and version, then uploads through a presigned URL that carries no auth header
tags: cli, fabric, publish, registry, auth
---

# fabric publish verifies the addon before packing, and sends the logged-in token only to the registry

`FabricPublish` in `packages/cli/src/fabric/functions/publish.function.ts` runs its
checks in order before anything is uploaded.

It calls `FabricAddonVerify` first and throws `FabricPreconditionError` when the
result is not ok (`publish.function.ts:37-43`). Then it resolves the API context and
requires a stored token, or it refuses with "Not logged in. Run `pikku fabric login`
first." (`publish.function.ts:45-52`). It requires `package.json` with a name and a
version (`publish.function.ts:54-67`).

Packing is by `npm pack` into a temporary directory (`publish.function.ts:73-81`).
The API requests carry `Authorization: Bearer <token>` (`publish.function.ts:83-86`).
The upload is a PUT to the presigned URL with no extra headers
(`publish.function.ts:106-108`). The comment says the signature covers the host only,
so added headers would break it. The token therefore goes to the API calls and not
to the storage URL.

**What this rules out:** publishing an addon that failed verification, publishing
without a stored login, and sending the bearer token to the presigned upload URL.
