---
type: decision
title: The console git push uses the developer's own git credentials, cannot prompt for them, and runs only where a git service is wired
description: push-git-changes delegates to gitService.push, which runs git with every credential prompt disabled, so the push uses credentials already set up on the machine
tags: console, git, credentials
---

# The console git push uses the developer's own git credentials, cannot prompt for them, and runs only where a git service is wired

`pushGitChanges` (`packages/addon/pikku-console/src/functions/push-git-changes.function.ts`)
is gated by `pikku:console:git:sync` (`push-git-changes.function.ts:11`). Its
description says it pushes "using your own git credentials"
(`push-git-changes.function.ts:9`). It throws `LocalEnvironmentOnlyError` when no
`gitService` is wired (`push-git-changes.function.ts:13-16`) and otherwise calls
`gitService.push()` (`push-git-changes.function.ts:18`).

`GitService.push` is documented as pushing "with the user's own git credentials"
(`packages/code-edit/src/git.service.ts:427`). Git is spawned with
`GIT_TERMINAL_PROMPT: '0'`, `GIT_ASKPASS: ''`, `SSH_ASKPASS_REQUIRE: 'never'` and
`GCM_INTERACTIVE: 'never'` (`packages/code-edit/src/git.service.ts:26-30`). So git
cannot prompt for a credential; it uses whatever is already configured locally.

The service is constructed only inside the `metaBasePath` branch of the console
services, at `packages/addon/pikku-console/src/services.ts:77` and
`services.ts:98`. Elsewhere `gitService` is null and the function throws.

**What this rules out:** the console storing or accepting a git token, and a push
that prompts for credentials.
