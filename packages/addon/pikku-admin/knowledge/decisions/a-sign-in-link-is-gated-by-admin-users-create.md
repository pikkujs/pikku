---
type: decision
title: Sending a sign-in link is gated by admin:users:create, not by a scope of its own
description: The sendSignInLink function reuses admin:users:create because the link goes only to the user's own inbox and is weaker than admin:users:password
tags: admin, users, scopes, invitations
---

# Sending a sign-in link is gated by admin:users:create, not by a scope of its own

`sendSignInLink` in `packages/addon/pikku-admin/src/functions/send-sign-in-link.function.ts` is exposed
over RPC (`send-sign-in-link.function.ts:9`) and declares `scopes: ['admin:users:create']`
(`send-sign-in-link.function.ts:15`). Its description says that with `magicLink({ disableSignUp: true })`
the link admits only an email that already has a user row, so it works as the invitation for an
account created without a password (`send-sign-in-link.function.ts:8`).

The comment at `send-sign-in-link.function.ts:10-14` gives the reasons for reusing the create scope.
The link is the second half of provisioning an account out of band. It is strictly weaker than
`admin:users:password` because it goes to the user's own inbox and hands the caller nothing. A separate
leaf scope would also have to be mirrored byte-for-byte in `@pikku/better-auth`'s scope tree, which would
make an addon bump impossible to upgrade on its own.

The function then calls `sendAuthUserSignInLink` with the email and callback URL
(`send-sign-in-link.function.ts:19`). The mechanics of that call are in
[an invitation is a magic link to an existing account](../../../../services/better-auth/knowledge/decisions/an-invitation-is-a-magic-link-to-an-existing-account.md).
Setting a password directly is a different and stronger action, covered by
[an admin sets a user's password without the reset flow](an-admin-sets-a-users-password-without-the-users-reset-flow.md).

**What this rules out:** a dedicated sign-in-link scope that has to be mirrored into the better-auth
tree, and treating the link as equivalent to setting a password.
