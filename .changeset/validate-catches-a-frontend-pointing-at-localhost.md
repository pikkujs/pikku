---
'@pikku/cli': patch
---

Fail `pikku fabric validate` when a deployed frontend points at localhost.

A frontend that reads `import.meta.env.VITE_API_URL ?? 'http://localhost:3002'`
deploys green and is broken on arrival. Nothing in the deploy container writes a
`VITE_*` / `NEXT_PUBLIC_*` variable, and nothing can: the stage hostname is
chosen when the worker is published, after the bundle has already been built. So
the fallback is what the production bundle ships, and every call a real browser
makes hangs until it times out — with nothing in any log, because the request
never left the visitor's machine.

Reported as an error on every deployable declared frontend, with the fix fabric's
own app template already uses: derive the base from the page's own origin. The
app and the API share a hostname and the dispatcher claims `/api/*` on it, so
`location.origin + '/api'` is right on a stage, a preview and a custom domain
alike.

A bare localhost URL with no env read behind it warns rather than errors, and is
suppressed entirely when the app reads `location.origin` somewhere — there the
literal is the dev branch of an answer that is already correct, and warning on it
would train people to ignore the finding that matters. Tests, `.d.ts` files and
comments are not scanned: none of them reach a browser.
