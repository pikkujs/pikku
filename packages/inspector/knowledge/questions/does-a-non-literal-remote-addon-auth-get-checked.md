---
type: question
title: Does a non-literal auth on wireRemoteAddon get checked?
description: A non-literal auth value is recorded exactly like an omitted one, so the consumer's credential and secret checks never run for it
tags: [inspector, addon, auth]
---

# Does a non-literal auth on wireRemoteAddon get checked?

`addWireRemoteAddon` in `packages/inspector/src/add/add-wire-remote-addon.ts` reads
`auth` only when it is an object literal (lines 42-46). Otherwise `hasAuth` stays
`false` (line 31) and `authCredentialId` and `authSecretId` stay undefined.

The comment at lines 27-30 says `hasAuth` separates "public" (omitted) from "bound
via a custom resolve()" (present, with no static id). A non-literal `auth` value
therefore looks the same as an omitted one. The declaration is written at lines
71-78, with `hasAuth` at line 75.

Nothing in the inspector reads `hasAuth`. Its only other mentions are the type at
`packages/inspector/src/types.ts:749` and serialization at
`packages/inspector/src/utils/serialize-inspector-state.ts:172`. The post-process
checks run only when an id is set: the credential id at
`packages/inspector/src/utils/post-process.ts:773` and the secret id at line 779.

Question: should a non-literal `auth` be treated as a binding the consumer has to
satisfy, or as public? The code currently does neither and logs nothing.
