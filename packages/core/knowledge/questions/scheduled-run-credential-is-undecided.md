---
type: question
title: Which credential does a scheduled virtual-user run present?
description: A scheduled run needs a credential that needs no admin at run time; the candidates are an API key, an in-app job or a login, and each has a gap verified in the code
tags: services, auth, workflow
---

# Which credential does a scheduled virtual-user run present?

A scheduled run must act as a test account without an admin at run time
([decision](../decisions/security/a-scheduled-virtual-user-run-needs-no-admin-at-run-time.md)).
Three candidates, with what the code shows for each:

**1. API key on the test account.** The app already verifies `x-api-key` in
`betterAuthSession` (`packages/services/better-auth/src/auth-session.ts`, around
line 109). `mapKey` turns a verified key into a session with restricted scopes,
so the request runs as the test account with no login step and no impersonation
header. Gaps:
- The repo verifies keys but does not create them. No `createApiKey` call was
  found in core, the CLI or better-auth.
- Expiry and rotation of keys were not checked.
- The API-key branch returns before the impersonation block, so a key cannot use
  the impersonation header. This is fine if the run uses the test account's own
  key.

**2. A job inside the app mints a session for the test account.** Needs a path
that creates a session without a password or key. Not verified; it is a new
login door, and it was judged the riskiest option.

**3. A normal login with a stored password.** Works with no code change, but it
stores a password where a key would do.

The earlier decision (no admin at run time) is not in question. What is open is
which of these the deploy uses, and whether key creation is built or added.
