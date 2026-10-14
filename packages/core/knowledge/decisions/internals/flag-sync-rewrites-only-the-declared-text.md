---
type: decision
title: Flag declaration sync rewrites only the description and anyOf
description: The FeatureFlagStore contract re-syncs a flag's description and anyOf on deploy and leaves enabled, rollout and overrides to the operator
tags: core, flags, services
---

# Flag declaration sync rewrites only the description and anyOf

The `FeatureFlagStore` interface in `packages/core/src/services/feature-flag-service.ts:79-90`
declares `syncFlags`. Its doc comment says a flag's `description` and `anyOf` are
re-synced on each deploy, because that is the declaration's whole content. It also
says `enabled`, the rollout and every override belong to the operator and are never
touched.

Lines `:80-83` say a removed declaration leaves its row marked `declared: false`
rather than deleting the operator's switch.

Core defines only the interface here. The implementing store is not in this
package, so the rule is the contract's, and was not verified against an
implementation.

**What this rules out:** a deploy overwriting an operator's enabled state, rollout
or overrides, and deleting a flag row because its declaration was removed.
