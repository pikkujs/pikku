---
type: decision
title: Addon screen scopes hide a screen and do not enforce access
description: The scopes on a defineScreens entry state what a viewer must hold to see the screen; the addon's own functions are the access check
tags: core, addons, screens, security
---

# Addon screen scopes hide a screen and do not enforce access

`packages/core/src/wirings/addon/define-screens.ts:7-8` documents `scopes` on an
addon screen as required of the viewer to see it, and says the addon's functions
must enforce the same scopes, because hiding a screen is not access control.

The field is read statically by `pikku all`, which is why `scopes` must be a
literal (`define-screens.ts:32`). Within `packages/core/src`, no code reads a
screen's `scopes` at runtime; `wire-addon.ts:47-48` mounts the screens under
`/addons/<name>` and is the only other place they are referenced.

**What this rules out:** relying on a screen's scopes to keep data from a viewer,
and an addon shipping a function that trusts the screen to have been hidden.
