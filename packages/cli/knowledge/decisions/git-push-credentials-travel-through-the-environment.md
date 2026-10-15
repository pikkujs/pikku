---
type: decision
title: Git push credentials travel through the environment and a credential helper
description: pushWithCredential passes the username and password as environment variables read by an inline credential helper, so they stay out of argv, the remote URL and .git/config
tags: cli, git, credentials
---

# Git push credentials travel through the environment and a credential helper

`pushWithCredential` in `packages/cli/src/utils/git.ts` pushes a branch with a one-shot credential
(`git.ts:291-307`). The doc comment says the token is passed through the environment and read back by an
inline helper, and gives the reason: a URL with embedded credentials or an `extraheader` puts the secret in
argv, where `ps` shows it (`git.ts:295-300`).

The command sets `credential.helper=` to clear inherited helpers, then an inline helper that echoes
`PIKKU_GIT_USERNAME` and `PIKKU_GIT_PASSWORD` (`git.ts:308-313`). The two values are supplied in the
environment (`git.ts:321-322`). The comment at `git.ts:323-325` says an interactive helper is disabled so a
CLI with no one at the terminal cannot hang.

**What this rules out:** a token in argv, in the remote URL, or in `.git/config`.
