---
type: decision
title: HMAC verification fails closed on empty or malformed inputs
description: verifyHmacSignature returns false for an empty secret, a missing signature, an unknown algorithm, an empty key, a malformed hex signature or an empty signature
tags: core, security, webhooks
---

# HMAC verification fails closed on empty or malformed inputs

`verifyHmacSignature` in `packages/core/src/utils/hmac.ts:142-161` returns `false`
in each of these cases:

- an empty secret or a missing signature (`:150`);
- an algorithm with no entry in `HMAC_HASH` (`:153`);
- a secret that decodes to an empty key (`:155`);
- a hex encoding whose signature does not match `^(?:[0-9a-fA-F]{2})+$` (`:156-158`);
- a signature that decodes to zero bytes (`:161`).

The key is imported with WebCrypto `importKey` (`:162-166`). The doc comment at
`:139-140` says the comparison is `crypto.subtle.verify('HMAC', ...)`, which runs
in the platform's constant-time implementation. `timingSafeStringEqual`
(`:52-63`) is a separate helper for opaque tokens and is not used for HMACs.

**What this rules out:** treating an empty secret, or a signature that does not
decode, as a match.
