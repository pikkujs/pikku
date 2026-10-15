---
type: decision
title: Auth schema checks trigger on any betterAuth Session middleware, not the literal name
description: hasAuthSessionMiddleware matches the regex betterAuth followed by any word and Session against the middleware groups, so the stateless variant also enables the auth checks
tags: cli, validate, auth, better-auth
---

# Auth schema checks trigger on any betterAuth Session middleware, not the literal name

`hasAuthSessionMiddleware` in `packages/cli/src/functions/validate/shared-checks.ts` reads the middleware
groups metadata from the function directory (`shared-checks.ts:186-190`). It returns true when any
instance's definition id matches `/^betterAuth\w*Session$/` (`shared-checks.ts:191-193`).

The comment says the stateless variant is a separate definition id, wired whenever `session.cookieCache`
is enabled. An exact-name match saw no auth on the apps most likely to have it, and skipped every auth
schema check (`shared-checks.ts:179-184`).

**What this rules out:** an exact-name match on `betterAuthSession`, which would skip the auth checks
for a stateless setup.
