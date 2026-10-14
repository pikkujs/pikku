---
type: decision
title: A studio header token must be at least 32 characters
description: registerStudioSession installs nothing when PIKKU_STUDIO_TOKEN is unset or shorter than 32 characters, and otherwise grants a pikku:console session only to a matching x-pikku-studio header
tags: cli, studio, auth, middleware
---

# A studio header token must be at least 32 characters

`registerStudioSession` in `packages/cli/src/functions/wirings/studio/register-studio-session.ts`
returns `false` and registers nothing when the token is missing or shorter than 32
characters (`register-studio-session.ts:23-24`). The token defaults to `PIKKU_STUDIO_TOKEN`
(`register-studio-session.ts:23`).

When a token passes, the global middleware sets a `pikku:console` session only if the
request has no session already and its `x-pikku-studio` header matches the token
(`register-studio-session.ts:14-18`). The comparison is constant-time, using
`timingSafeEqual` on equal-length buffers (`register-studio-session.ts:8-12`).

**What this rules out:** a short token that is easy to guess, and a studio header that
overrides a session the request already has.
