---
type: decision
title: Signed content URLs bind the request path and verify fail-closed
description: A signature that only carries timestamps authorizes every asset, and a verifier with no key must refuse rather than allow
tags: content
---

# Signed content URLs bind the request path and verify fail-closed

`LocalContent` signs a payload containing the decoded request path, and the
verifier in `pikku-node-http-server.ts` compares it against the path actually
requested. `LocalContent` requires a `JWTService` and throws without one; a
verifier with no key available rejects with 403 rather than allowing the
request, logging once per process so an attacker-triggerable path cannot flood.

A signature over `{signedAt, expiresAt, notBefore}` alone proves only *when* a
URL was issued, never *what* it was issued for. Any valid token was a skeleton
key: swap the pathname from a public thumbnail to a private document and the
signature still verifies. Timestamps bound the window; only the path binds the
asset.

The path is the representation both signing entry points can produce and the
verifier can reconstruct — it sees a request line, and cannot recover the
bucket/key split from it. `signedContentPath` normalizes both sides identically
(pathname only, origin and query dropped, `decodeURIComponent` falling back to
the raw pathname on a malformed escape) so a difference in encoding cannot
become a difference in verdict.

`pikku serve` and `pikku dev` mint an ephemeral per-process signing key, so
local content serving works with no configuration without shipping a fail-open
path. URLs signed by one dev-server process are meaningless to the next, which
is the correct lifetime for a dev secret.

**What this rules out:** signing a URL without binding it to what it grants;
returning "valid" from a verifier that could not check anything; normalizing the
path differently on the two sides; and constructing `LocalContent` without a
JWT service.
