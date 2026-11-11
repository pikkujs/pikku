---
type: decision
title: Product hooks are generated into the backend SDK
description: useAnalytics and useFlag are emitted to .pikku/sdk/<backend>/exposed/pikku-product.gen.ts, each only when its declaration and scaffold exist
tags: cli, codegen, sdk, react, analytics, flags
---

# Product hooks are generated into the backend SDK

`@pikku/react` ships `usePikkuAnalytics<Event>()` and `useFeatureFlag<Name>(name)`
generic over the vocabulary, and the vocabulary is the app's: events from
`defineAnalyticsEvents`, flags from `defineFeatureFlags`. Apps used to hand-write
a binding file closing the generics over their own types. `pikku product` (run by
`pikku all`) writes it instead, as `useAnalytics` and `useFlag`.

- It follows the react-query generator: a `PikkuClientSdkFiles` key
  (`productFile`), set only for a backend pass, so it lands in `exposed/` and
  frontends import it from the SDK.
- Each hook is emitted only when its declaration exists and its client can: events
  need `scaffold.analytics` (the generated ingest is where `AnalyticsEvent` comes
  from), flags need `scaffold.featureFlags`. Neither declared, nothing written.
- It is skipped when `@pikku/react` does not resolve from the project, the same
  test the react-query hooks apply, because the file imports it.
- Not gated on HTTP: the hooks bind types and touch no route.

## Rejected

- Types read from the declarations with `StandardSchemaV1.InferOutput`: a second
  derivation of the union the ingest already builds.
- Putting the hooks in `@pikku/react` itself: the package cannot know the app's
  types, which is why the generics exist.
