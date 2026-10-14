---
type: decision
title: The generated CLI channel client sends the saved session token to whatever PIKKU_WS_URL names
description: When run directly, the generated channel client takes its socket URL from PIKKU_WS_URL, prefers PIKKU_API_KEY, and otherwise sends the human session token from the session file
tags: cli, channels, credentials, session
---

# The generated CLI channel client sends the saved session token to whatever PIKKU_WS_URL names

The generated CLI channel client in `packages/cli/src/functions/wirings/cli/serialize-channel-cli-client.ts` runs when it is
executed directly. It takes its URL from `PIKKU_WS_URL`, with a default of a localhost channel (`serialize-channel-cli-client.ts:206`).

The comment says a machine API key takes precedence, and otherwise the human session saved by `pikku login` is used
(`serialize-channel-cli-client.ts:208-213`). The code sends `x-api-key` when `PIKKU_API_KEY` is set (`serialize-channel-cli-client.ts:215-216`).
Otherwise it reads `~/.pikku/session.json`, takes the current session's `accessToken`, and sends it as a bearer
`authorization` header (`serialize-channel-cli-client.ts:218-233`).

The URL is not checked against any host before the header is attached. The comment's reason that a browser cannot read the
file applies only to the server runtime where this block runs.

**What this rules out:** pointing `PIKKU_WS_URL` at a host other than the one the user logged in to without the token following it.
