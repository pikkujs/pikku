---
type: overview
title: Questions
description: Things asked of the admin addon and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated,
so the doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should admin credential scopes reach any user's credential by a caller-supplied user id?](should-admin-credential-scopes-reach-any-users-credential-by-user-id.md) — The credential admin functions read, write, delete and enumerate per-user credentials by a userId the caller supplies, gated only by admin:credentials scopes, and no comment says that reach is intended
- [Why does an admin's own ban throw while lifting one does not?](why-does-an-admins-own-ban-throw-while-lifting-one-does-not.md) — setUserBanned refuses a ban whose target is the calling user, and allows the same call with banned false; no comment, test or note says why
- [Should getMyAccess stay without a declared scope when most admin functions declare one?](should-get-my-access-be-open-to-any-session-or-declare-a-scope.md) — getMyAccess is exposed with no scopes and no permissions, returns empty values for a session without a user, and its gate is only the session requirement of pikkuFunc
<!-- /pikku:knowledge-index -->
