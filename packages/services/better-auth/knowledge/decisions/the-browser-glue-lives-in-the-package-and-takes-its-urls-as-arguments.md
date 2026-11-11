---
type: decision
title: The Better Auth browser glue lives in the package and takes its URLs as arguments
description: "@pikku/better-auth/client and /vite hold the sign-in client, cookie refresh, route gates and the cross-site session relay, parameterised by apiUrl, paths and the session fetcher, with the relay's header names defined once"
tags: better-auth, client, vite, cross-site
---

# The Better Auth browser glue lives in the package and takes its URLs as arguments

`@pikku/better-auth/client` exports `createBetterAuthApp({ apiUrl, fetchSession, redirect,
loginPath, homePath, resetPasswordPath })`, which returns the account flows, the session cookie
refresh and the `requireAuthentication` / `redirectIfAuthenticated` gates. Nothing in it reads a
global: the app supplies its API base, how to fetch the session and how to redirect, which is what
lets `pikku` generate the three-line wrapper an app needs.

`@pikku/better-auth/vite` exports `crossSiteSession({ envFile })`, a serve-only Vite plugin that
relays the session cookie through localStorage for browsers that refuse third-party cookies. The
header names it and the server plugin agree on are defined once in `cross-site-cookies.ts`; the
client module imports them. `apiUrl` is injected through a virtual module, so the relay talks to
the same origin the app's generated `apiUrl()` returns.

**What this rules out:** each app owning a copy of the sign-in client and the relay, with the
header names written in two repositories.
