---
type: decision
title: An omitted userId on CredentialService addresses the platform credential
description: The CredentialService contract reads and writes the platform-level credential whenever a per-credential call omits userId, and the better-auth implementation defaults its platform owner to pikku-platform
tags: core, credentials, security, interface
---

# An omitted userId on CredentialService addresses the platform credential

`CredentialService` in `packages/core/src/services/credential-service.ts` is the store for dynamic
credentials such as OAuth tokens and per-user keys. Its doc comment says that throughout the interface,
an omitted `userId` means the platform-level credential (`packages/core/src/services/credential-service.ts:4`).

The per-credential methods take an optional `userId`: `get` (`credential-service.ts:7`), `set` (`:9`),
`delete` (`:11`) and `has` (`:13`). Omitting it selects the platform credential, so the caller chooses
the identity by whether it passes one.

The methods that enumerate users are different. `getAll` requires `userId` (`credential-service.ts:15`),
and `getUsersWithCredential` and `getAllUsers` take a credential name or nothing
(`credential-service.ts:17` and `:19`). They do not have a platform default.

The better-auth implementation applies the platform default only to some credentials. It takes an optional
`platformUserId` that falls back to `PLATFORM_USER_ID` (`packages/services/better-auth/src/better-auth-credential.service.ts:58`).
Its owner lookup returns null for a name that is not an OAuth2 credential (`better-auth-credential.service.ts:69-70`),
returns that platform owner only for a singleton OAuth2 name (`better-auth-credential.service.ts:72-73`),
and otherwise returns the `userId` passed in, or null when none was passed (`better-auth-credential.service.ts:75`).
So for a non-singleton credential, an omitted `userId` reads as no owner, not as the platform credential. The
interface comment describes the platform case more widely than this implementation does. Who may link the
singleton is covered by [a singleton credential belongs to a reserved platform user](../../../../services/better-auth/knowledge/decisions/a-singleton-credential-belongs-to-a-reserved-platform-user.md).

**What this rules out:** a sentinel string or an empty value to mean the platform credential, and relying on an
omitted `userId` to reach the platform credential for a credential that is not a singleton.
