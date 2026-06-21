---
'@pikku/cli': patch
---

feat(fabric-validate): warn when better-auth units won't tree-shake. `pikku
fabric validate` now flags two anti-patterns that force every non-auth unit to
bundle the full better-auth server (~2.5MB each, bloating bundles and the serial
deploy uploads): (1) a `pikkuBetterAuth` config that doesn't enable
`session.cookieCache` — fix by adding `session: { cookieCache: { enabled: true } }`
so the CLI splits out the lean `betterAuthStatelessSession`; and (2) a
hand-written global `addHTTPMiddleware('*', [betterAuthSession()])` that pulls the
stateful bridge into every unit. Both are `warn` severity. Note: a custom
`mapSession` is currently pre-empted by the generated stateless middleware
(pikkujs/pikku#754), so the stateful workaround stays valid until that's resolved.
