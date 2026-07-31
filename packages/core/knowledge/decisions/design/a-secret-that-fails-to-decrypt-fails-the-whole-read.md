---
type: decision
title: A secret that fails to decrypt fails the whole read
description: getSecrets throws naming the key and its key_version rather than omitting the row, because a silent omission surfaces as an unrelated failure much later
tags: crypto, storage
---

# A secret that fails to decrypt fails the whole read

Every store's bulk read — `getSecrets` in the kysely, mongodb and redis secret
services — wraps the `getKEK` + `envelopeDecrypt` pair in a try/catch that
rethrows:

```
Failed to decrypt secret "<key>" (key_version <n>): the configured KEK does not
match the key it was wrapped under
```

with the original crypto error as `cause`. A key that has no row at all is still
simply absent from the returned object; only a row that exists and will not
decrypt is fatal.

Those two cases look similar and are not. A missing key is an ordinary, callable
state — the caller asked for something that was never stored, and the typed
secret layer above already decides what to do about an absent value. A stored
row that will not decrypt means the service is holding ciphertext it cannot
read: a `PIKKU_SECRET_KEK` that does not match what the value was wrapped under,
a `previousKey` missing for an older `keyVersion`, or a change to the derivation
itself. Nothing the caller can do downstream makes that better.

Dropping the row instead hands back a partial map, and the failure re-emerges
somewhere with no connection to secrets — an auth middleware reading an
undefined signing key and answering "server configuration error", a provider
client constructed with `undefined` credentials and 401-ing. The name of the
secret and the `key_version` it was wrapped under are precisely the two facts
that turn that into a one-line fix, and they are known at the catch site and
nowhere after it.

This matters most at exactly the moment it is least convenient: a change to
`deriveKEK` makes *every* previously stored secret undecryptable at once. Loud
failure names the first one; silence produces an empty map and a support ticket.

**What this rules out:** a `getSecrets` that skips unreadable rows; returning
`undefined` for a row that exists; collecting failures and returning them
alongside the successes, which just moves the ignoring one level up; and
treating a missing key as an error, which would break callers that legitimately
probe for optional secrets.

See [[the-kek-salt-is-scoped-to-the-key-version]].
