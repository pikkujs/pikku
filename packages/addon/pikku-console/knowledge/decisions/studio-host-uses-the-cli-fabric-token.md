---
type: decision
title: The studio host uses the CLI's Fabric token, and a linked project always routes model calls through the developer's LiteLLM key
description: resolveStudioHost takes the Fabric token from the CLI context; when a project is linked, models come from getDeveloperLiteLLMKey whatever PIKKU_STUDIO_AI is set to, and only an unlinked project reads the flag
tags: console, studio, fabric, credentials
---

# The studio host uses the CLI's Fabric token, and a linked project always routes model calls through the developer's LiteLLM key

The token comes from `resolveApiContext`. It is `FABRIC_TOKEN` from the environment,
or the token stored in the CLI auth file for the API URL
(`packages/cli/src/fabric/lib/config.ts:20`).

`resolveStudioHost` (`packages/addon/pikku-console/src/services/studio-host.service.ts:405`)
treats a project as linked when the context has both a token and a `projectId`
(`studio-host.service.ts:412`). In that branch the changes and wishes stores use
the Fabric RPC with that token (`studio-host.service.ts:413-418`). Models are set
to `fabricModels(rpc)` unconditionally on that branch (`studio-host.service.ts:419`),
whatever `PIKKU_STUDIO_AI` holds.

In the unlinked branch, `fabricModels` is used only when `PIKKU_STUDIO_AI` is
`fabric` and a token exists (`studio-host.service.ts:423-426`). Otherwise
`localModels` applies (`studio-host.service.ts:426`).

`fabricModels` spreads the result of `rpc.invoke('getDeveloperLiteLLMKey', {})` and
sets the model from `PIKKU_STUDIO_MODEL`, defaulting to `gemini-flash-lite-latest`
(`studio-host.service.ts:400-403`).

**What this rules out:** a linked project using the local `OPENAI_API_KEY` or
`PIKKU_STUDIO_AI_KEY` path. The `PIKKU_STUDIO_AI=fabric` flag is needed only to
borrow the key from an unlinked project.
