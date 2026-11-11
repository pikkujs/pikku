---
name: pikku-flags
description: >-
  Switch a feature without a deploy: flag, toggle, turn on, turn off, rollout, beta. defineFeatureFlags, `featureFlag`, useFeatureFlag, FeatureUnavailableError. Who may use something for good is pikku-permissions.
installGroups: [core]
---

# Pikku Flags

What to reach for and why. For how to call it, run this once: `pikku doc defineFeatureFlags pikkuFunc useFeatureFlag FeatureUnavailableError`.

Flags are declared in `packages/functions/src/flags.ts`. The one already there is a placeholder: replace it.

## The rule

**The real check is on the server.** Put `featureFlag: 'name'` on every function behind the feature, then hide its screen with `useFlag('name')`, which `pikku all` generates into the backend SDK (`@sdk/<backend>/pikku-product.gen`) once the app declares flags and sets `scaffold.featureFlags`. Import it from there; do not write a binding file. Hiding alone leaves it callable. The function answers 503 with `FeatureUnavailableError`: show "not available right now", not a permission message.

**A flag is availability, not access.** Who may use something is `scopes` and `permissions`. `anyOf` only shapes what a client is told; it does not gate the function.

## What the compiler cannot tell you

- A declared flag with no stored row is ON for everyone, in a function and in a client.
- Every instance that runs a flagged function needs a `featureFlags` source in its singleton services. Without one the gate fails open and the function runs for everyone. `PikkuProvider` configures the client only.
- The first sync stores it OFF, and publishing syncs. A new flag on a live feature goes dark at its first publish until someone turns it on. Tell the owner.
- A sync never touches a value someone set, so a killed flag stays killed.
- A rollout buckets by organization, then user. A signed-out caller has no bucket and gets the feature. For a beta, prefer an override per person or organization.
- A function sees a change at once, or within seconds on other instances. An open page keeps its map until it reloads or calls `refresh()`.

## "Turn X off for now"

A switch, not a code change. Do not delete or comment out code.

1. X has a flag: the owner flips it on the Switches screen, or call `admin:flagSetEnabled` with `{ name, enabled: false, note }`. This needs the `admin:flags:manage` scope. No deploy.
2. X has no flag: declare one, put `featureFlag` on all of X's functions, hide it in the screen, and publish.
3. Leave the flag in place, so "turn it back on" is one switch.

When a rollout is finished for good, remove the flag from code. `admin:flagPrune` clears the row.

## When it does not work

- `useFlag` throws: add `featureFlags: createFeatureFlags<FeatureFlagName>({ endpoint })` to the instance given to `PikkuProvider`.
- Every flag reads false: set `featureFlags: true` under `scaffold` in `pikku.config.json`.
- `admin:flag*` answers 404: list those functions in `expose` on the admin `wireAddon`.
