---
'@pikku/better-auth': patch
---

Adds `@pikku/better-auth/client`, the browser side of Better Auth that every app used to copy: `createBetterAuthApp` returns the sign-in, sign-up, Google, password reset and sign-out calls, the session cookie refresh and the `requireAuthentication` / `redirectIfAuthenticated` route gates, parameterised by `apiUrl`, paths and the session fetcher. Adds `@pikku/better-auth/vite`, whose `crossSiteSession` plugin relays the session cookie through localStorage in third-party-cookie-blocking browsers during dev; its header names come from `cross-site-cookies.ts` so client and server cannot disagree. `vite` is an optional peer dependency.
