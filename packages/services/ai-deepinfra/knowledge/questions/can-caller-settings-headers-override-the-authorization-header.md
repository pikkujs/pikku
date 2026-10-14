---
type: question
title: Can a caller's settings.headers override the DeepInfra Authorization header?
description: resolveConfig spreads settings.headers after the bearer key, so an authorization key in the caller's headers replaces the key; a differently cased key is not covered by this code
tags: [deepinfra, headers, auth]
---

# Can a caller's settings.headers override the DeepInfra Authorization header?

`resolveConfig` in `packages/services/ai-deepinfra/src/deepinfra-config.ts` builds the
headers as a function (`deepinfra-config.ts:39-47`). It reads the key from
`settings.apiKey` or `DEEPINFRA_API_KEY`, and throws if neither is set
(`deepinfra-config.ts:40-45`). It returns
an object whose `authorization` entry is the bearer key, followed by a spread of
`settings.headers` (`deepinfra-config.ts:46`).

The spread comes last, so a key named exactly `authorization` in `settings.headers`
replaces the bearer value. The code does not check for that, and the file has no
comment about it.

A key written as `Authorization` is a separate property on the object, not the same
key. Whether both values reach the request depends on how the fetch layer merges
them. This note did not read that layer, so it cannot say which value is sent.

Open: is a caller meant to be able to replace the bearer key through `headers`? If not,
the spread would need the key set after the caller's headers.
