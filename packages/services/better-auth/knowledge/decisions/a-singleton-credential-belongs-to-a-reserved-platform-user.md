---
type: decision
title: A singleton credential belongs to a reserved platform user behind an admin scope
description: A credential shared by the whole app is owned by the reserved pikku-platform user, and only a caller holding admin:credentials:link may connect it
tags: better-auth, oauth, credentials, scopes
---

# A singleton credential belongs to a reserved platform user behind an admin scope

A `type: 'singleton'` credential is the app's, not a user's. Connecting it rebinds
the token for every user, so the rules are:

- **Admin only.** The default `canLinkSingleton` requires `admin:credentials:link`
  (`ADMIN_SCOPES.credentialsLink`) through the ScopeService. Any other caller gets
  `SINGLETON_LINK_FORBIDDEN`. An app can replace the gate with its own
  `canLinkSingleton`.
- **Owned by `pikku-platform`.** The owner is the reserved user `PLATFORM_USER_ID`.
  Its comment says it is "never sign-in-able: it is created with no credential
  account of any kind." The user is created lazily on first link, so an app with no
  singleton credentials never gets the row.
- **Found by email, not id.** The row is created asking for the id
  `pikku-platform`, but under `advanced.database.generateId: 'uuid' | 'serial'`
  better-auth assigns its own. So both the plugin and
  `BetterAuthCredentialService` find it by the reserved address
  `platform@pikku.internal` (`findPlatformUserId`). Looking it up by the reserved
  id created a new Platform user on every link under those id schemes, and the
  credential service never found the token.
- **A match on the address is not proof of ownership.** The row is created on
  first link, so until then `platform@pikku.internal` is free to sign up with
  through email and password, which needs no inbox. `findPlatformUserId` therefore
  refuses a user that holds a `credential` account (a password) and throws
  `ReservedPlatformEmailError`; the link endpoint answers `409
PLATFORM_USER_RESERVED`, and `BetterAuthCredentialService` fails closed the same
  way. Without the check, whoever signed up first would own every singleton token.
- **Why not the clicker.** The comment says that otherwise the credential "would
  silently become that person's, and vanish when they unlinked it."

**What this rules out:** binding a platform token to a signed-in user who is not an
admin, creating the platform user at startup, and treating whoever holds the
reserved address as the platform user.
