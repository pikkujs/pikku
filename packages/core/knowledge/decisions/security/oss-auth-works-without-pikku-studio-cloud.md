---
type: decision
title: Open-source auth works without Pikku Studio Cloud
description: Every virtual-user sign-in path works in an app that runs no Pikku Studio Cloud code; the signing key is the project's own, never a cloud-issued credential
tags: services, auth
---

# Open-source auth works without Pikku Studio Cloud

Virtual users and staged impersonation must all work in an open-source app with
no Pikku Studio Cloud service and no cloud-issued token. The cloud may add its
own way in, but nothing in core, the CLI or the better-auth service may require
it.

The code holds to this. A virtual user signs in either in-process
(`inProcessSignIn`, no credential at all) or with a signed statement
(`statementSignIn`), both in `packages/core/src/services/virtual-user-sign-in.ts`.
The statement is signed with an Ed25519 key the project owns:
`packages/cli/src/utils/virtual-user-signer.ts` generates it for `pikku dev`, or
reads `VIRTUAL_USER_SIGNING_KEY` from whoever deploys the stage. The app is given
only the public half, as `VIRTUAL_USER_VERIFY_KEY`
(`packages/services/better-auth/src/virtual-user-plugin.ts`).

**What this rules out:** any design where Pikku Studio Cloud is the issuer of the
credential a virtual user presents. A signer that only exists in the cloud cannot
be the basis for an open-source feature.
