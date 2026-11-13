---
type: decision
title: A webhook source with a verify step declares a singleton credential for its secret
description: When a webhook source has a verify step, written out or as shorthand, the inspector registers a string credential named by the source unless the author sets credential, and records verify and credential in the source's metadata
tags: [inspector, triggers, webhooks, credentials]
---

# A webhook source with a verify step declares a singleton credential for its secret

The inspector engines are Go and Rust (the TypeScript engine is retired), so this lives in
`addWireTriggerWebhookSource` in `packages/inspector-go/internal/visit/group_trigger.go`, the
reference, and its port `add_wire_trigger_webhook_source` in
`packages/inspector-rust/src/visit/group_trigger.rs`.

A source has a verify step when it has a `verify` property, either written out (`verify: x`) or
as a shorthand (`verify,`). Both are found with `getPropertyAssignmentInitializer(obj, "verify",
true)`, the `true` following the shorthand. Without one, the visitor records the source and stops.

With one, the credential name is the `credential` property if set, otherwise
`webhookSecretCredentialName(name)`. The visitor records a credential definition with
`type: 'singleton'` and a string schema under that name. Its display name is
`<name> webhook secret`, and its description is the `credentialDescription` property when set.

The same name is written to the source's `webhookSourceMeta` as `credential`, beside `verify`:
`{ kind, header?, algorithm? }` from `webhookVerifyMeta` / `webhook_verify_meta`. The kind is
`hmac`, `token` or `publicKey` for a declared form and `function` for a verify function; `header`
and `algorithm` are recorded only when written as string literals in an object literal, so a
value that is only known from its type (`verify: shared`, or a shorthand) records the kind alone.

**What this rules out:** a verified webhook source whose secret is left out of the credential
declarations or the metadata. The author can choose a different credential name, but a verify
step always registers one, however the `verify` property is spelled.
