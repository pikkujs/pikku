---
type: decision
title: Channel message handlers accept three config shapes
description: onMessage may be a function config, a wrapper with middleware, or a wrapper around a function config — the runtime discriminates structurally
tags: channel
---

# Channel message handlers accept three config shapes

`processMessageHandlers` in
`packages/core/src/wirings/channel/channel-handler.ts` has to tell apart three
things a caller may put on `onMessage` or inside `onMessageWiring`:

- a direct function config, where `onMessage.func` is a plain `Function`;
- a wrapper, where `onMessage.func` is itself a `CorePikkuFunctionConfig` and so
  has its own nested `.func`;
- a simple wrapper, which carries a plain `Function` under `func` _and_ a
  sibling `middleware` array.

The `isWrapper` check tests exactly that: an object with `func`, where either
`func` is an object that itself has `func`, or the object also has `middleware`.
Only a wrapper contributes message-level middleware; a direct config contributes
none. `wireChannel` in `channel-runner.ts` performs the mirror-image unwrapping
when registering the function, using `(handler as any).func instanceof Function`
to decide whether to register the handler or its inner `func`.

**What this rules out:** narrowing on a single property (`'middleware' in
onMessage` alone misclassifies a nested function config; `'func' in onMessage`
alone misclassifies a direct config), and reducing the accepted shapes without
updating both this discriminator and the registration path in `wireChannel`.
