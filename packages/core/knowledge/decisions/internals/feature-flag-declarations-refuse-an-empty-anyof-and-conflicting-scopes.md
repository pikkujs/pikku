---
type: decision
title: Feature flag declarations refuse an empty anyOf and conflicting scopes
description: validateAndBuildFeatureFlagDefinitionsMeta throws on an anyOf that is an empty list, and on a repeated flag name whose scopes differ between declarations
tags: core, flags, validation
---

# Feature flag declarations refuse an empty anyOf and conflicting scopes

`validateAndBuildFeatureFlagDefinitionsMeta` in
`packages/core/src/wirings/flag/validate-flag-definitions.ts:70-98` checks each
declaration in two ways.

An `anyOf` that is an empty array throws (`:78-84`). The message says an empty
list satisfies nobody, and that a pure switch should omit `anyOf`.

When a flag name is declared twice, the two `anyOf` lists are compared as sorted
JSON (`:86-90`). A difference throws (`:91-97`), and the message says flags sharing
a name must name the same scopes.

**What this rules out:** a flag that no session can satisfy, and two declarations
of one flag that disagree about who may see it.
