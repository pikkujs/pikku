---
type: decision
title: A banned user is refused at session creation and the ban lapses on expiry
description: The pikku ban plugin refuses a session for a banned user at creation, clears an expired ban only when that happens, and a ban written by an admin ends existing sessions at once
tags: better-auth, ban, sessions
---

# A banned user is refused at session creation and the ban lapses on expiry

`pikkuBan` (`ban-plugin.ts`, id `pikku-ban`) is the enforcement half of
better-auth's `admin()` plugin, without the rest of it. It adds three user columns
(`banned`, `banReason`, `banExpires`) and one session hook. The hook runs before a
session is created and throws `FORBIDDEN` with code `BANNED_USER` for a banned
user. The message defaults to a generic "contact support" line and can be set.

- **Expiry is settled lazily.** An expired ban is cleared inside that same hook,
  at the moment a session would be created. There is no sweeper.
- **Admin bans end sessions now.** `setAuthUserBanned` (`admin-users.ts`) writes
  the columns and then calls `deleteUserSessions`, so the ban does not wait for a
  current session to expire. Unbanning does not touch sessions.
- **The plugin decides no authority.** Who may ban is the `admin:users:ban` scope
  on the calling RPC. The plugin never reads scopes or the caller.

The stateless session path is weaker. It cannot see a ban until its cookie cache
expires. That is described in
[the stateless cookie decision](the-stateless-session-cookie-gets-a-one-day-lifetime-unless-the-app-sets-one.md).

**What this rules out:** a timer that sweeps expired bans, a ban check that
depends on the caller's roles, and banning without ending existing sessions on the
database-backed path.
