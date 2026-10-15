---
type: question
title: Why does an admin's own ban throw while lifting one does not?
description: setUserBanned refuses a ban whose target is the calling user, and allows the same call with banned false; no comment, test or note says why
tags: admin, bans, sessions
---

# Why does an admin's own ban throw while lifting one does not?

`setUserBanned` (`packages/addon/pikku-admin/src/functions/set-user-banned.function.ts`)
is gated by `admin:users:ban` (`set-user-banned.function.ts:10`). Before it
delegates to `setAuthUserBanned` (`set-user-banned.function.ts:21`), it throws
`'You cannot ban yourself'` when `banned` is true and `userId` equals
`session.userId` (`set-user-banned.function.ts:18-20`).

The check applies only to a ban. The same call with `banned: false` for the
caller's own id is not refused by this function.

The file has no comment on the check. A search of the repository found no test and
no knowledge note that refers to it.

Open: is the refusal meant to stop an admin locking their own account out, and is
lifting one's own ban meant to remain allowed? The code does not say which of
these it was written for.
