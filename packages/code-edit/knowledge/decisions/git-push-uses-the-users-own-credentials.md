---
type: decision
title: Git push uses the user's own credentials and never prompts
description: The git service pushes with whatever credentials the user already has, and git is told never to open a prompt
tags: [code-edit, git, credentials]
---

# Git push uses the user's own credentials and never prompts

`runGit` in `packages/code-edit/src/git.service.ts` sets `GIT_TERMINAL_PROMPT` to `'0'`
and `GIT_ASKPASS` to an empty string (lines 27-28), so git is not left a way to ask
for a username or token.

`push()` in the same file (line 428) is documented as pushing "with the user's own git
credentials" (line 427). Its push runs through `runGit` (line 463) with the timeout
from `networkTimeoutMs`.

**What this rules out:** the service holding or asking for a credential of its own.
A push with no usable credential on the machine is not answered with a prompt.
