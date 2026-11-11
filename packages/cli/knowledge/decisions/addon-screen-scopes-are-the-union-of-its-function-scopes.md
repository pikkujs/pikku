---
type: decision
title: An addon's screens are granted exactly the union of its own functions scopes
description: The screens manifest scopes are the sorted, de-duplicated union of the scopes on the addon's functions, and the screen file does not take a hand-written list
tags: cli, addons, screens, scopes
---

# An addon's screens are granted exactly the union of its own functions scopes

`deriveScreensScopes` in `packages/cli/src/functions/wirings/screens/serialize-screens.ts` takes the
scopes of every function in the addon, removes duplicates and sorts them (`serialize-screens.ts:54-62`).
The doc comment says the role is the scopes the functions require and nothing the addon declares by
hand, so the list cannot drift from what the functions enforce (`serialize-screens.ts:50-53`).

The caller in `pikku-command-screens.ts` passes `deriveScreensScopes(functions.meta)`
(`packages/cli/src/functions/wirings/screens/pikku-command-screens.ts:50`). `serializeScreensMeta`
writes that list as `scopes` into the manifest (`serialize-screens.ts:68-80`, `serialize-screens.ts:76`).

The unit test asserts the derived list and an empty result for a function without scopes
(`packages/cli/src/functions/wirings/screens/serialize-screens.test.ts:76-90`).

**What this rules out:** a screens manifest that declares scopes its functions do not require.
