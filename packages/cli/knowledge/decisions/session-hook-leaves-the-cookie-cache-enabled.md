---
type: decision
title: The generated useSession hook does not disable the Better Auth cookie cache
description: The generated session hook fetches get-session with no cookie-cache option, so an ordinary cached read is what refreshes an expired session cookie
tags: cli, rpc, react, auth, session
---

# The generated useSession hook does not disable the Better Auth cookie cache

The React Query hook generator in `packages/cli/src/functions/wirings/rpc/serialize-react-query-hooks.ts` emits `useSession`.
Its comment says the signed `session_data` cookie is the only thing authenticating a request under the stateless
session, and that the hook does not pass `disableCookieCache` (`serialize-react-query-hooks.ts:67-77`).

The emitted hook calls `/auth/get-session` with a `queryKey` of `pikkuSession` and sets a 10 minute refetch interval and a 2
minute stale time (`serialize-react-query-hooks.ts:95-113`). It sets no cookie-cache option. The comment's reason, that Better
Auth reads the database and mints a fresh cookie once the cached payload is stale, is about Better Auth internals that this
repo's CLI does not show, so it is recorded here as the author's stated reason.

**What this rules out:** adding `disableCookieCache` to the hook. The comment says that turns every refetch into a database read.
