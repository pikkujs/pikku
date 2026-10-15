---
type: decision
title: An external virtual user caller presents one signed statement
description: Callers outside the app sign an EdDSA statement naming the virtual user; the app verifies it against a public key and accepts each statement once
tags: services
---

# An external virtual user caller presents one signed statement

The statement is an EdDSA (Ed25519) JWT: `sub` is the virtual user id, `aud` is the
app's origin, `iat`, `exp` a few minutes out (default 180 seconds, ceiling 300), and
`jti`, a one-time id. The CLI signs it with `node:crypto`; the app verifies it with
`JoseVirtualUserStatementVerifier` (`packages/services/jose`), `jwtVerify` pinned to
`algorithms: ['EdDSA']`, against a public key. `POST /sign-in/virtual-user` takes
`{ statement }`, maps `sub` to a declared virtual user, and signs it in.

It is rejected for a wrong algorithm (`none` and HS256 included), a wrong key, a wrong
audience, expiry, a lifetime beyond the ceiling, a missing `sub` or `jti`, and a `jti`
already accepted. The replay store is a per-process map of `jti` to expiry, purged on
each call, so it never outgrows the last few minutes of statements.

One statement replaces three older credentials — a secret derived per virtual user from
a root, an operator token with impersonation, and an app-wired sign-in hook — because
each of them put something the app could mint a session from in the hands of a caller,
or in the app's own configuration. A public key lets the app check a statement and
nothing else; capturing the app's environment yields no ability to sign one.

The **id-only dev switcher** (`/sign-in/switch-virtual-user`) is unchanged under
`pikku dev`. Anywhere else it also needs a `statement` naming the same id, so no
deployed stage has a credential-free way in.

The statement endpoint needs the declared virtual users to map an id to an address, so
it is registered only when the app passes `virtualUserSignIn.virtualUsers`, which the
generated `virtualUserList` supplies.

**What this rules out:** the app holding a private key, a statement without an
expiry or one-time id, an algorithm negotiated by the token, and a switcher that works
on a stage without proof.
