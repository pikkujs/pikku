---
type: decision
title: The wish-deck generator sends whatever key and URL it is given as a bearer token
description: generateWishDeck posts to access.proxyUrl with access.apiKey as a Bearer header and checks no host; the studio host builds that access object from env or from the Fabric LiteLLM key
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
In local mode `localModels` takes `proxyUrl` from `PIKKU_STUDIO_AI_BASE_URL` or
`OPENAI_BASE_URL`, defaulting to `https://api.openai.com/v1`, and takes `apiKey`
from `PIKKU_STUDIO_AI_KEY` or `OPENAI_API_KEY` (`studio-host.service.ts:382-398`).
In fabric mode `fabricModels` takes the key from `getDeveloperLiteLLMKey`
(`studio-host.service.ts:400-403`).

**What this rules out:** pinning the proxy host inside `generateWishDeck`, and any
authorisation scheme on this call other than a bearer key.
