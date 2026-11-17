---
type: decision
title: The addon contract snippets are collected from the e2e wirings
description: refHTTP, refChannel and refCLI need an addon that publishes a contract, so their snippet regions live in e2e/packages/functions/src/wirings, collected beside templates/online-shop
tags: [snippets, surface, addon, e2e]
---

# The addon contract snippets are collected from the e2e wirings

`refHTTP`, `refChannel` and `refCLI` take a name generated from an installed
addon's published contract, so a top-level call needs a real name. The shop
installs no addon that publishes one; the e2e app installs `todos`, whose
`todos.contracts.ts` publishes `todoRoutes`, `todoChannel` and `todoCommands`.

The regions therefore sit in `e2e/packages/functions/src/wirings/todos-*.wirings.ts`.
Three consumers collect them, each taking the extra directory next to
`templates/online-shop`: `--snippets-extra` in `build.sh` and
`generate-surface-doc.ts`, `SNIPPET_SOURCES` in `packages/skills/scripts/embed.ts`,
and `snippetSources` in `skills-snippets.test.ts`. A name defined in both places
fails as a duplicate.

**What this rules out:** wrapping the calls in a function with a generic contract
name to keep them in the shop. A wire call inside a function is critical PKU367.
