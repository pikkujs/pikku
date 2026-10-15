---
type: decision
title: Dev webhook registrations are refused when git tracks them and gitignored otherwise
description: pikku dev refuses to register webhooks when git tracks the registrations file, which holds signing secrets, and appends it to .gitignore when git does not ignore it
tags: cli, dev, webhooks, secrets
---

# Dev webhook registrations are refused when git tracks them and gitignored otherwise

`packages/cli/src/functions/commands/dev-webhook-registrations.ts` keeps dev webhook
registrations in one file. The comment says the file holds signing secrets and must never be
committed (`dev-webhook-registrations.ts:37-41`).

`guardFromGit` checks `git ls-files --error-unmatch` on that file (`dev-webhook-registrations.ts:43-45`).
When git tracks it, the function returns a refusal that says to untrack it first
(`dev-webhook-registrations.ts:46`). When `git check-ignore` reports the file is not ignored,
the file name is appended to `.gitignore` (`dev-webhook-registrations.ts:48-54`). Outside a git
repository the guard does nothing (`dev-webhook-registrations.ts:40`).

**What this rules out:** running `pikku dev` with the registrations file tracked by git.
