---
'@pikku/core': patch
---

Fix `onConnect`/`onDisconnect` wrapper handlers, and correct `wireChannel`'s generic arguments

`CoreChannel` accepts three shapes for a handler: a function config, a simple wrapper (`{ func, middleware }`), and a wrapper around a function config (`{ func: { func }, middleware }`). `wireChannel` unwrapped the third shape for `onMessage` and `onMessageWiring`, but registered `onConnect` and `onDisconnect` as-is — so the registered config's `func` was an object, and the function runner threw when it tried to call it. All three shapes now register a callable config on every handler.

`wireChannel`'s type arguments were also misaligned with `CoreChannel`'s parameter list: `PikkuPermission` was being passed into the `ChannelConnect` slot and `PikkuMiddleware` into `ChannelDisconnect`, which made `wireChannel({ onConnect: { func } })` fail to typecheck with "not assignable to `CorePikkuPermission`". End users did not see this — the CLI's generated `wireChannel` wrapper casts before calling core — but anyone importing `wireChannel` from `@pikku/core/channel` directly did. The signature is now `wireChannel<In, Channel>(channel: CoreChannel<In, Channel>)`; the three surplus type parameters were never used for anything correct and are gone.
