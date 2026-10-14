---
type: decision
title: fabric validate requires a dev actor quick login on any app with a login screen
description: The validator errors when an app has a login file but no one-click actor sign-in control matching the known patterns
tags: cli, validate, dev, auth
---

# fabric validate requires a dev actor quick login on any app with a login screen

The validator in `packages/cli/src/fabric/functions/validate.function.ts` checks each frontend app. The comment says
a frontend that ships a login screen must also ship the dev-only actor switcher, so a reviewer can view the app as
each scenario persona without a password. It fires only when a login surface exists (`validate.function.ts:1856-1861`).

It scans the app's source files, and for Next.js also `app/` and `pages/` (`validate.function.ts:1862-1870`). It records
login files matching `LOGIN_FILE_PATTERN` and sets `hasQuickLogin` when any file matches an actor quick-login pattern
(`validate.function.ts:1872-1882`).

When there is a login file and no quick login, it reports the error `app-missing-actor-quick-login-<name>`
(`validate.function.ts:1884-1887`).

**What this rules out:** an app with a login screen passing validation without the dev actor switcher.
