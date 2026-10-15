---
type: decision
title: Pikku Studio Cloud tokens live in ~/.pikkustudio/auth.json, keyed by API URL, written with mode 0600
description: The cloud CLI keeps one token per API URL and a defaultApiUrl in a single file, written with owner-only permissions
tags: cli, cloud, auth, storage
---

# Pikku Studio Cloud tokens live in ~/.pikkustudio/auth.json, keyed by API URL, written with mode 0600

`packages/addon/pikku-cloud-cli/src/lib/config.ts` keeps Pikku Studio Cloud credentials in
`~/.pikkustudio/auth.json` (`config.ts:28`). The `AuthFile` type holds a `tokens` map
keyed by API URL (`config.ts:15-20`). The comment says this lets one user stay logged
into production and local development at once.

`defaultApiUrl` records the URL of the last login, so a login against a local or
staging Pikku Studio Cloud stays the default for later commands (`config.ts:21-25`).

`readAuthFile` returns an empty token map when the file is missing (`config.ts:30-34`).
`writeAuthFile` creates the directory and writes the file with `mode: 0o600`
(`config.ts:36-42`).

This is a separate store from the Pikku CLI session file. For that one, see
[CLI sessions live in one 0600 file, keyed by server URL](cli-session-is-one-0600-file-keyed-by-server-url.md).

**What this rules out:** a Pikku Studio Cloud token in the project directory, and one global
token that forgets which API it was issued by.
