---
type: decision
title: The studio host uses the CLI's Pikku Studio Cloud token, and a project linked to the cloud keeps its changes there
description: resolveStudioHost takes the cloud token from the CLI context; with a token and a projectId the changes store is the cloud one, otherwise it is the local .studio file
tags: console, studio, cloud, credentials
---

# The studio host uses the CLI's Pikku Studio Cloud token, and a project linked to the cloud keeps its changes there

The token comes from `resolveApiContext`. It is `PIKKUSTUDIO_API_KEY` from the
environment, or the token stored in the CLI auth file for the API URL
(`packages/addon/pikku-cloud-cli/src/lib/config.ts`).

`resolveStudioHost` (`packages/addon/pikku-console/src/services/studio-host.service.ts`)
treats a project as linked when the context has both a token and a `projectId`.
In that branch the changes store is `CloudChangesStore`, calling the cloud RPC
with that token. Otherwise it is `LocalChangesStore`, a file under `.studio/`.

The host no longer carries a wish list or model access: the wish deck was removed.

**What this rules out:** a linked project filing changes to the local file.
