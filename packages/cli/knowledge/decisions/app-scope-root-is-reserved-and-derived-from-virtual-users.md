---
type: decision
title: The app scope root is reserved and derived from virtual users
description: The scopes generator adds an app tree built from virtual user app fields and refuses any declared scope with the same root, and addon scope trees are stamped with their addon as origin
tags: cli, scopes, virtual-users, addons
---

# The app scope root is reserved and derived from virtual users

`withAppScopes` in `packages/cli/src/functions/wirings/scopes/pikku-command-scopes.ts`
throws when a `defineScope` call declares the reserved `APP_SCOPE_ROOT`. The message says
that two trees answering to one name make a grant ambiguous.

When no collision exists, it appends the tree `buildAppScopeDefinition` builds from the
virtual users' `app` fields. The comment says that tree is not a declaration the inspector
can find, which is why it is added here.

`withAddonOrigin` stamps an addon's `app`-origin trees with the addon's package name and
display name. The comment says that without this, an addon's scopes read as the host app's.

**What this rules out:** a user scope root that shadows the virtual-user-derived tree, and an
addon whose scopes look like the host's.
