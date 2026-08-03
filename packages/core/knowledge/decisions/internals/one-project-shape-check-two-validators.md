---
type: decision
title: One project-shape check, called by both validators
description: workspace validate and fabric validate were separate walks over the same project that duplicated sixteen findings verbatim; the shared half now lives in shared-checks.ts and fabric validate is that plus the deploy-shaped checks
tags: cli, validate, fabric
---

# One project-shape check, called by both validators

`pikku workspace validate` and `pikku fabric validate` read like one command
with a flag. They were two implementations — 495 lines and 2026 — that walked
the same project and emitted sixteen identical findings. `functions-dir-missing`
existed character for character in both files. All sixteen already agreed on
severity, which is the only reason the duplication was invisible.

What the duplication cost was not the lines. It was that each validator carried
checks the other lacked for no reason anyone could name, and nobody noticed
because nobody read them side by side:

- fabric validate never checked that `packages/functions` declares zod v4, or
  that it has a `package.json` at all — while it did check that six other
  dependencies are present.
- workspace validate never checked the four scaffold flags beyond `console`,
  though the console it requires is useless without `rpc`.
- fabric validate swallowed a JSON parse error and reported
  `pikku-config-missing` for a file sitting right there.

Two of workspace validate's own checks were not merely absent from fabric — they
had never run anywhere:

- the auth checks were gated on a middleware instance with `definitionId ===
  'betterAuthSession'`, but the CLI wires `betterAuthStatelessSession` whenever
  `session.cookieCache` is on, which is the configuration Fabric asks for. So
  they skipped precisely the apps most likely to have auth.
- they looked for migrations in `packages/functions/db/`, and for tables named
  `app_user` and `auth_verification_token`. `pikku db migrate` reads migrations
  from `<root>/db/<engine>/`, and those two table names appear nowhere else in
  pikku or in any template. Had the gate ever opened, the check would have been
  wrong for every project it fired on.

`shared-checks.ts` is now the half that is true of any pikku project regardless
of where it deploys. Workspace validate is exactly that module; fabric validate
is that module plus the deploy-shaped checks — themes, frontends, the
Cloudflare adapter, the `.gitignore` contract, the frontend type-check.

Fabric's fix hints won where the two differed: they are multi-line and show the
config block to paste, and there was no reason workspace users were getting the
one-line version.

**What this rules out:** adding a check to one validator and not the other;
`pikku fabric validate` reporting a corrupt config as a missing one; asserting
auth table names no scaffold generates; and reading migrations from anywhere
other than where `pikku db migrate` reads them.
