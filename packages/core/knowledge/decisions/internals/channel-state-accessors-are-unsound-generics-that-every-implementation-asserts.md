---
type: decision
title: `getState<T>()` lets the caller name any type, so every implementation asserts
description: The type parameter appears only in the return position with nothing to infer from, so it is a caller-chosen claim rather than a checked fact
tags: core, channel
---

# `getState<T>()` lets the caller name any type, so every implementation asserts

`PikkuChannel` declares its per-connection scratch state as:

```ts
setState<T>(state: T): Promise<void> | void
getState<T>(): Promise<T | undefined> | T | undefined
```

`T` on `getState` appears only in the return position, with no parameter to
infer it from. So `T` is whatever the caller writes, and the call site gets that
type back with nothing having checked it. `setState<T>` is separately generic,
so the two are not even tied to each other — a channel can be written with one
shape and read as another and neither call complains.

Every implementation therefore holds its state in a concrete variable and
asserts on the way out. The SSE channel in `http-runner.ts` and the CLI channel
in `cli-runner.ts` both do exactly that, and the assertion is unavoidable: no
concrete value is assignable to a type the caller has not yet chosen.

**What this rules out:** deleting the assertions in the implementations — they
are forced by the signature, not by sloppiness. Fixing this properly means
making the channel generic in its state type (`PikkuChannel<Opening, Out,
Remote, State>`) so `setState` and `getState` agree and inference has something
to work from, which changes the type of every channel in every app. Until that
is worth doing, the assertions stay and this note explains why they exist.
