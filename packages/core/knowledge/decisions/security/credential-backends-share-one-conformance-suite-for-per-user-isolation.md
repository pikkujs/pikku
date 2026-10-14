---
type: decision
title: Credential backends are checked by one conformance suite that proves per-user isolation
description: defineCredentialServiceTests asserts that one user's credential is invisible to another and that KEK rotation re-wraps stored values, for any backend that supplies a credential service
tags: core, credentials, testing, isolation
---

# Credential backends are checked by one conformance suite that proves per-user isolation

`defineCredentialServiceTests` in `packages/core/src/testing/service-tests/credential-service-tests.ts`
is the shared conformance suite for `credentialService`. Its doc comment says it
"runs only when a backend supplies one" (`credential-service-tests.ts:6`), so a
backend without a credential service is not checked by it.

Per-user isolation is asserted directly. A value set for `user-1` is read back
only for `user-1`, and `user-2` gets its own value (`credential-service-tests.ts:53-62`).
A delete for one user leaves the other user's credential in place
(`credential-service-tests.ts:64-72`). `getAll` for one user returns that user's
credentials and omits another user's (`credential-service-tests.ts:85-95`), and
returns `{}` for an unknown user (`credential-service-tests.ts:97-101`).

KEK rotation is asserted too. After rotation to a new key version, a credential
written under the old key is still readable, and the new key alone can read it
(`credential-service-tests.ts:103-133`). Rotation without a `previousKey` throws
(`credential-service-tests.ts:135-141`).

**What this rules out:** a credential backend that returns one user's stored value
to another user, or that rotates keys without re-wrapping existing credentials,
while still passing the suite.
