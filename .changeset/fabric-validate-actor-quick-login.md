---
'@pikku/cli': patch
---

`pikku fabric validate` now checks that a frontend with a login screen also ships the
one-click actor sign-in.

The dev-only "Sign in as …" switcher is what lets anyone open a sandbox and view the app
as each scenario persona without knowing a password. When a generated app shipped a login
form and nothing else, the reviewer was locked out of their own project — and nothing
caught it until someone tried to log in by hand.

The check fires only when the app actually has a login surface, so an app with no auth is
left alone. It looks for the canonical fingerprints — a rendered `<DevActorSwitcher />`, a
call to `signInAsActor()`, or a request to `/auth/sign-in/actor` — and reports
`app-missing-actor-quick-login-<app>` as an error when a login screen exists without any
of them. Defining the switcher without rendering it does not count.

Next.js apps keep their routes outside `src/`, so `app/` and `pages/` are scanned too.
