---
type: decision
title: CLI sessions live in one 0600 file, keyed by server URL
description: Bearer tokens from pikku login are stored in ~/.pikku/session.json with owner-only permissions, one entry per normalized base URL
tags: cli, auth, storage
---

# CLI sessions live in one 0600 file, keyed by server URL

`packages/cli/src/utils/cli-session.ts` keeps every stored login in
`~/.pikku/session.json` (`cli-session.ts:33-34`). The file maps a normalized base
URL to a session, and a `current` field names the default target
(`cli-session.ts:26-31`). Trailing slashes are stripped so `https://x/` and
`https://x` share an entry (`cli-session.ts:39-40`).

The file is written with mode `0600`, and the comment gives the reason: it
holds bearer tokens (`cli-session.ts:57-58`). The mode is passed on write, so
it applies when the file is created. An existing file keeps whatever mode it
already has.

A corrupt file is read as empty rather than failing every command
(`cli-session.ts:49-51`). When the last session is cleared the whole file is
removed instead of left as an empty object (`cli-session.ts:104-106`).

Machine agents are not meant to read this file. The interface comment says they
use scoped API keys instead (`cli-session.ts:11-14`).

**What this rules out:** a token in the project directory, a token in an
environment variable written by the CLI, and a single global session that
forgets which server it belongs to.
