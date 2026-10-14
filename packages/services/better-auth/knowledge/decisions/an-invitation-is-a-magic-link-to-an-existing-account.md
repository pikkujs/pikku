---
type: decision
title: An invitation is a magic link to an existing account
description: sendAuthUserSignInLink uses the magic-link plugin with sign-up disabled, so an invite can only reach an address that already has a user row and needs no invitation table
tags: better-auth, admin, invitations
---

# An invitation is a magic link to an existing account

`sendAuthUserSignInLink` (`admin-users.ts`) mails a user a magic link. Its doc
comment calls this the invitation. An account created without a password has no
credential, and `magicLink({ disableSignUp: true })` admits only an email that
already has a user row. So the link is an invitation by construction, and there is
no separate invitations table.

Other rules in the same function:

- **No directory check first.** The plugin refuses an unknown address itself. A
  lookup here would give two answers that could disagree.
- **Empty headers, not the caller's.** The endpoint requires headers, so an empty
  `Headers` is passed. The caller's headers are not used, because that would hand
  an admin's cookies to a send made for someone else.
- **Clicking the link verifies the address**, as a side effect.
- **It refuses to run without the plugin.** Missing `magicLink()` throws a
  configuration error.

**What this rules out:** sending invitations to addresses with no account, reusing
the calling admin's session cookies, and a separate invitation store.
