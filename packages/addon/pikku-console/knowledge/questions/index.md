---
type: overview
title: Questions
description: Things asked of the console addon and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated,
so the doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should a session holding the admin root skip the ownership check on a single agent thread?](should-an-admin-root-skip-the-thread-ownership-check.md) — isThreadOwner returns true for any session with the admin scope root before it loads the thread, so admins read any single thread; the comment defends the refusal of a missing thread but not this bypass
- [Should every holder of the virtual-user read scope see every persona's cadence?](should-every-virtual-user-reader-see-every-personas-cadence.md) — getVirtualUserSchedules returns every schedule row the store holds, with no persona or per-caller filter, to anyone holding pikku:console:virtualUsers:read
- [Should getMyAccess stay without a declared scope when every other console function declares one?](should-get-my-access-be-open-to-any-session-or-declare-a-scope.md) — getMyAccess is exposed with no scopes and no permissions, returns empty values for a session without a user, and its gate is only the session requirement of pikkuFunc
- [Should the security-audit child process inherit the whole server environment?](should-the-security-audit-child-inherit-the-whole-environment.md) — spawnProcess gives the pikku audit child a copy of every environment variable of the server, and the function that starts it is gated only by pikku:console:security:run; no comment says the full environment is needed
<!-- /pikku:knowledge-index -->
