---
type: decision
title: A webhook source with a verify step declares a singleton credential for its secret
description: When a webhook source has a verify step, the inspector registers a string credential named by the source unless the author sets credential
tags: [inspector, triggers, webhooks, credentials]
---

# A webhook source with a verify step declares a singleton credential for its secret

In `packages/inspector/src/add/add-trigger.ts`, the code returns early unless the source has a
`verify` initializer (line 283). When it has one, the credential name is the `credential`
property if set, otherwise `webhookSecretCredentialName(name)` (lines 285-287). That helper is
imported from `@pikku/core/trigger` (line 21).

The inspector then records a credential definition with `type: 'singleton'` and a string schema,
named by that value (lines 288-297). Its display name is `<name> webhook secret` (line 291), and
its description is the `credentialDescription` property when set (lines 292-294).

**What this rules out:** a verified webhook source whose secret is left out of the credential
declarations. The author can choose a different credential name, but a verify step always
registers one.
