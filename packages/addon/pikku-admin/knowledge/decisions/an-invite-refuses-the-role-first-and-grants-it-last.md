---
type: decision
title: An invite checks the role first, then creates the account, sends the link and grants the role last
description: inviteUser is one call under admin:users:create that refuses a bad role before writing anything, keeps the account when the mail fails, and grants the role only after the link went out
tags: admin, users, scopes, invitations
resource: func:inviteUser
---

# An invite checks the role first, then creates the account, sends the link and grants the role last

`inviteUser` in `packages/addon/pikku-admin/src/functions/invite-user.function.ts` is the whole
invitation in one call: `{ email, name?, role? }` answering `{ userId, created }`. It runs the
same internals as `createUser` and `sendSignInLink` (`createAuthUser` and `sendAuthUserSignInLink`
from `@pikku/better-auth`) rather than calling those functions over RPC.

It declares `admin:users:create`, the scope both halves already use (see
[a sign-in link is gated by admin:users:create](a-sign-in-link-is-gated-by-admin-users-create.md)),
so it adds no leaf that would have to be mirrored into `@pikku/better-auth`'s scope tree. Granting
a role is checked inside the function with `verifyScopes(['admin:scopes:manage'], session)`, only
when `role` is given, the same way `listUsers` checks `admin:scopes:read` for `includeRoles`.

The order is fixed:

1. **Normalise and validate the email.** Trimmed and lowercased; a value that is not an email is a
   400 `INVALID_EMAIL`.
2. **Refuse the role before writing anything.** The scope check, a missing scope service, and a role
   the scope service does not offer (absent, or a system role whose declaration was removed) all
   refuse before an account exists, so a refused invite leaves nothing behind.
3. **Refuse a banned user.** A ban whose `banExpires` has passed counts as lifted, matching
   `pikkuBan()`.
4. **Create the account if the email has none, otherwise reuse it.** The row must exist before the
   link goes out, because `magicLink({ disableSignUp: true })` admits only an existing user
   ([an invitation is a magic link to an existing account](../../../../services/better-auth/knowledge/decisions/an-invitation-is-a-magic-link-to-an-existing-account.md)).
5. **Send the link.** If it fails the account is kept, so calling again resends rather than failing
   on a duplicate email.
6. **Grant the role last**, only when not already held, with the caller as `grantedBy`. A role is
   never granted to someone who was not told they have an account.

Calling it again with the same email is a re-invite: no new account, a new link, and the role added
if given and not yet held.

The refusals are registered `PikkuError`s whose message starts with a code a client matches on:
`USER_BANNED` (422), `UNKNOWN_ROLE` (400) and `MAIL_FAILED` (422). Each is below 500 because the HTTP
error handler only passes the thrown message to a production caller under 500. None is 403, 404,
409 or 502-504, which a client reads as not allowed, a missing function, or the app not running; a
missing `admin:scopes:manage` is the ordinary 403 `MissingScopeError`, which is "not allowed". A
`MAIL_FAILED` hides the mailer's own words, except better-auth's "requires the magicLink() plugin"
configuration error, which is kept after the code so a client can tell "no magic link configured"
apart from a mail that did not go.

**What this rules out:** a separate invite scope, an invitations table, granting a role before the
link is sent, deleting the account when the mail fails, and a 5xx refusal whose code a production
client would never see.
