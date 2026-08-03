---
'@pikku/cli': patch
---

validate: `pikku fabric validate` is now `pikku workspace validate` plus the deploy checks

The two validators were separate implementations that walked the same project and emitted sixteen identical findings. The shared half moved into one module both call, which also fixes four things the duplication was hiding:

- fabric validate now checks zod v4 and `packages/functions/package.json`, and reports a corrupt `pikku.config.json` as corrupt rather than missing
- workspace validate now checks all five scaffold flags, not just `console`
- the auth checks were gated on `betterAuthSession` and never fired for apps wiring the stateless variant; they now match either
- they read migrations from `<root>/db/<engine>/`, where `pikku db migrate` reads them, and look for better-auth's own tables (`user`, `session`, `account`, `verification`) instead of `app_user`/`auth_verification_token`, which no scaffold ever generated

Two finding ids changed as a result: `pikku-config-no-console-scaffold` → `pikku-config-no-scaffold-console`, and `auth-schema-missing-app-user`/`auth-schema-missing-verification-token` → a single `auth-schema-missing-tables`.

New errors: `pikkuScenario`, `pikkuFeature` and `pikkuScenarioStep` must live in a `*.scenario.ts`, `*.scenarios.ts` or `*.steps.ts` file, and `definePersonas`/`runVirtualUser` in a `*.virtual-user.ts` or `*.vu.ts` file, rather than mixed into application code.
