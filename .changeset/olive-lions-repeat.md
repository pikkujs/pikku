---
'@pikku/cli': patch
---

Stop the frontend skills teaching a localhost server URL, and cover TanStack Start

`pikku-react`, `pikku-react-query` and `pikku-realtime` all showed
`serverUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`.
`import.meta.env` is a *build-time* substitution, so any deploy that supplies the
API URL as a runtime env var or platform binding leaves it `undefined` in the
shipped bundle — the fallback is then the only branch that ever runs in the
browser, and every request from the deployed app goes to the developer's own
machine. It works locally and fails the moment it is deployed.

The three skills now resolve through one shared `apiUrl()` helper that falls back
to same-origin `${window.location.origin}/api`, which needs no build-time
knowledge of the domain and is correct wherever the app is served from.
`pikku-react` documents the helper and why the localhost fallback is banned.

`pikku-react-query` also gains a TanStack Start section: the `import.meta.env.SSR`
branch, building auth clients lazily (Better Auth validates its baseURL with
`new URL()` at construction, so a module-scope client crashes SSR), the `/auth`
suffix that Better Auth needs when the base already carries a path, and the
`pikku tanstack-start` shim.

Finally, `pikku-better-auth`, `pikku-emails`, `pikku-addon`, `pikku-ai-vercel`,
`pikku-ai-agent` and `pikku-template-clone` are tagged `installGroups: [core]`.
They were in no group at all, so `pikku skills install --core` left an agent with
no guidance on auth, email, addons or the post-clone cleanup — all of which the
starter template ships with.
