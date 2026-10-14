---
type: decision
title: The app scope root is reserved and derived from personas
description: The scopes generator adds an app tree built from persona app fields and refuses any declared scope with the same root, and addon scope trees are stamped with their addon as origin
tags: cli, scopes, personas, addons
---

# The app scope root is reserved and derived from personas

`withAppScopes` in `packages/cli/src/functions/wirings/scopes/pikku-command-scopes.ts`
throws when a `defineScope` call declares the reserved `APP_SCOPE_ROOT`
(`pikku-command-scopes.ts:22-27`). The message says that two trees answering to one name
make a grant ambiguous (`pikku-command-scopes.ts:25`).

When no collision exists, it appends the tree built from persona `app` fields
(`pikku-command-scopes.ts:29-30`). The comment says that tree is not a declaration the
inspector can find, which is why it is added here (`pikku-command-scopes.ts:11-17`).

`withAddonOrigin` stamps an addon's `app`-origin trees with the addon's package name and
display name (`pikku-command-scopes.ts:43-51`). The comment says that without this, an addon's
scopes read as the host app's (`pikku-command-scopes.ts:33-37`).

**What this rules out:** a user scope root that shadows the persona-derived tree, and an
addon whose scopes look like the host's.
