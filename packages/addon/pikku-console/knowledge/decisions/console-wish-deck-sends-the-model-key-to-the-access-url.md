---
type: decision
title: The wish-deck generator sends whatever key and URL it is given as a bearer token
description: generateWishDeck posts to access.proxyUrl with access.apiKey as a Bearer header and checks no host; the studio host builds that access object from env or from the Pikku Studio Cloud LiteLLM key
tags: console, studio, ai, credentials
---

# The wish-deck generator sends whatever key and URL it is given as a bearer token

`generateWishDeck` (`packages/addon/pikku-console/src/services/wish-deck.ts:39-43`)
takes `access: ModelAccess & { model: string }`. It posts to
`new URL('chat/completions', access.proxyUrl...)` with the header
`authorization: Bearer ${access.apiKey}` (`wish-deck.ts:47-53`). The function
does not check the host of `proxyUrl`.

The studio host calls it at `packages/addon/pikku-console/src/services/studio-host.service.ts:322`,
with an access object it obtained from `this.models()` (`studio-host.service.ts:303`).
In local mode `localModels` uses `PIKKU_STUDIO_AI_KEY` with
`PIKKU_STUDIO_AI_BASE_URL` when `PIKKU_STUDIO_AI` is `key`, and otherwise (with
`PIKKU_STUDIO_AI` unset) `OPENAI_API_KEY` with `OPENAI_BASE_URL`; both URLs default
to `https://api.openai.com/v1` (`studio-host.service.ts:382-398`). In cloud mode
`cloudModels` takes the key from `getDeveloperLiteLLMKey`
(`studio-host.service.ts:400-403`).

**What this rules out:** pinning the proxy host inside `generateWishDeck`, and any
authorisation scheme on this call other than a bearer key.
