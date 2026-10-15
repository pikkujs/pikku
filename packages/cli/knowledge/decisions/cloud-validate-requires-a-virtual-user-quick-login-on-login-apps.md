---
type: decision
title: pikku cloud validate requires a dev virtual user quick login on any app with a login screen
description: The validator errors when an app has a login file but no one-click virtual user sign-in control matching the known patterns
tags: cli, validate, dev, auth
---

# pikku cloud validate requires a dev virtual user quick login on any app with a login screen

The validator in `packages/cli/src/cloud/functions/validate.function.ts` checks each frontend app. The comment says
a frontend that ships a login screen must also ship the dev-only virtual user switcher, so a reviewer can view the app
as each scenario virtual user without a password. It fires only when a login surface exists (`validate.function.ts:1856-1861`).

It scans the app's source files, and for Next.js also `app/` and `pages/` (`validate.function.ts:1862-1870`). It records
login files matching `LOGIN_FILE_PATTERN` and sets `hasQuickLogin` when any file matches one of
`VIRTUAL_USER_QUICK_LOGIN_PATTERNS` (`validate.function.ts:1872-1882`).

When there is a login file and no quick login, it reports the error `app-missing-virtual-user-quick-login-<name>`
(`validate.function.ts:1884-1886`).

**What this rules out:** an app with a login screen passing validation without the dev virtual user switcher.
