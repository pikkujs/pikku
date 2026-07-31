---
type: decision
title: Queue job identities are signed at enqueue
description: A job's pikkuUserId is an HMAC claim bound to the queue and payload; an unverifiable claim is dropped, never trusted
tags: queue, crypto, security
---

# Queue job identities are signed at enqueue

`QueueJob.pikkuUserId` used to be a bare string that `runQueueJob`
(`packages/core/src/wirings/queue/queue-runner.ts`) copied onto the wire, where
`defaultPikkuUserIdResolver` resolved it and `resolveSession` loaded that user's
session out of the `sessionStore`. Anyone able to write to the queue backend —
a `LPUSH` against Redis, a `SendMessage` against SQS — could name any user and
the worker would run as them.

The field now carries a signed claim instead:

```
pq1.<base64url({"u":<pikkuUserId>,"q":<queueName>,"j":<jobId>?})>.<base64url(HMAC-SHA256)>
```

The HMAC covers `pq1.<encoded claim>.<canonical JSON of the job payload>`, so a
signature cannot be lifted onto a different queue, a different payload, or —
when the producer knew the job id — a different job. `jobId` is optional
because most adapters (SQS, Cloudflare Queues, Azure Storage Queues) mint the id
after `add` returns and never see the producer's; binding the payload is what
holds in every adapter. Canonicalization sorts keys after a JSON round trip, so
transport reserialization cannot change the digest.

The key is expanded with HKDF from `PIKKU_QUEUE_IDENTITY_SECRET`, read through
the `SecretService`, under the `pikku:queue-identity` info namespace — the same
deployment secret therefore cannot produce a key that opens the remote-RPC
envelope. `signWithKeyMaterial` / `verifyWithKeyMaterial` in
`packages/core/src/crypto-utils.ts` are WebCrypto-only because that file is in
the Cloudflare Workers build; the `node:crypto` helpers behind
`WebhookService.sign` are not reachable from it.

Verification lives in `runQueueJob`, the single funnel every adapter calls.
`SignedQueueService` wraps any `QueueService` to sign on the way out.

Failure directions are deliberately asymmetric:

- **No secret configured**: the claim is dropped, the job still runs with no
  `pikkuUserId`, and one warning is logged per process. Hard-failing would break
  every deployment on upgrade, and per-job logging is an attacker-triggerable
  flood.
- **Secret configured, claim does not verify**: the identity is dropped and the
  rejection is logged per job — it sits alongside the per-job logs `runQueueJob`
  already writes, so it adds no flood an attacker did not already have.
- **Secret too short**: signing throws `WeakKeyMaterialError` at enqueue, so the
  misconfiguration surfaces on the producer, while the worker drops the identity
  rather than failing the job.

The threat model is a **compromised or shared queue backend**, nothing more. The
application process must hold the signing secret in order to sign, so an
attacker who has code execution inside the app can mint any claim it likes. This
defends the queue as a transport, not the app as a host. It also does not stop
replay of a byte-identical job, which is indistinguishable from the redelivery
every queue already performs; revocation is by rotating the secret.

**What this rules out:** treating `JobOptions.pikkuUserId` as trusted anywhere
downstream of the queue; letting a client-supplied value flow into it without an
authorization check first (signing proves the producer held the secret, not that
the producer was entitled to name that user); adding a `node:crypto` import to
`crypto-utils.ts`; reusing `pikku:queue-identity` as the info string for any
other purpose; and claiming this mitigates application compromise. See
[[queue-jobs-carry-the-producers-pikku-user-id]] and
[[passphrases-are-stretched-key-material-is-expanded]].
