---
type: decision
title: A remote addon's bound credential or secret id must name a wired slot, or validation reports a critical error
description: validateRemoteAddonAuth checks that a literal auth.credentialId or auth.secretId on a wireRemoteAddon names a declared credential or secret, and runs in every inspector pass
tags: inspector, addon, auth, validation
---

# A remote addon's bound credential or secret id must name a wired slot, or validation reports a critical error

`validateRemoteAddonAuth` in `packages/inspector/src/utils/post-process.ts:760` is one of the validators the
inspector runs in every pass that is not setup-only (`packages/inspector/src/inspector.ts:523`). It is called
at `packages/inspector/src/inspector.ts:578`, after the remote addon dependency check and before the scope checks.

Its doc comment limits what it checks. A `credentialId` must name a wired credential and a `secretId` a
wired secret. A custom `resolve()` and an omitted surface are not statically checkable, so they are left to
runtime (`post-process.ts:754-759`).

The function returns when no `wireAddon` declarations exist (`post-process.ts:764-765`). It then loops over
the remote declarations (`post-process.ts:771`). A `credentialId` that matches no credential definition
logs a critical `REMOTE_ADDON_AUTH_UNRESOLVED` error that lists the available credentials (`post-process.ts:773-776`).
A `secretId` that matches no secret definition gets the same error with the available secrets (`post-process.ts:779-782`).

Whether a non-literal `auth` value is checked at all is a separate gap, in
[does a non-literal remote addon auth get checked](../questions/does-a-non-literal-remote-addon-auth-get-checked.md).

**What this rules out:** a remote addon binding that names a credential or secret the consumer never wires,
passing inspection silently and failing only at runtime.
