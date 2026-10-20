---
type: decision
title: Addon screen scopes hide a screen and do not enforce access
description: The scopes on a pikkuStudio screen state what a viewer must hold to see the screen; the addon's own functions are the access check
tags: core, addons, screens, security
---

# Addon screen scopes hide a screen and do not enforce access

`packages/core/src/wirings/addon/pikku-studio.ts:24-25` documents `scopes` on a
`pikkuStudio` screen as hiding the screen and its nav from viewers without
access, and says the addon's functions must enforce the same scopes, because
hiding a screen is not access control.

The field is read statically by `pikku all`, which is why `scopes` must be a
literal (`packages/inspector/src/add/add-pikku-studio.ts:162-169`). Within
`packages/core/src`, no code reads a screen's `scopes` at runtime;
`wire-addon.ts:50-55` (`ui`) mounts the screens at the path each screen's
`scope` gives it and is the only other place they are referenced.

**What this rules out:** relying on a screen's scopes to keep data from a viewer,
and an addon shipping a function that trusts the screen to have been hidden.
