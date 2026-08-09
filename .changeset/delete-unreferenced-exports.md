---
'@pikku/core': patch
'@pikku/inspector': patch
---

Delete exports nothing references

A sweep of the `@pikku/core` surface for exports with no consumer anywhere in the repo — no package, template, verifier or e2e project imports them: `ExtractFunctionOutput`, `CLICommandDefinition`, `RequestHeaders`, `HTTPFunctionsMeta`, `HTTPWiringMiddleware`, `JsonRpcError`, `TriggerSourceInfo`, `getMCPResources`, `getMCPPrompts`, `onGraphNodeComplete` and `InputRef`.

Every one was a compatibility promise with nothing on the other end of it. Removing them narrows what 0.13 has to keep stable.

`isRef` looked like the twelfth, and isn't. It is the type guard that reads what `createRef` writes — the `__isRef` brand marking a graph node input as "substitute another node's output here". Nothing imported it because neither it nor `RefValue` was reachable from any entry point, so the one consumer that needed it, the inspector's graph serializer, had reimplemented the same four conditions privately as `isRefValue` along with its own structural copy of `RefValue`. Deleting `isRef` would have made that duplicate permanent, with the brand's shape asserted in two places free to drift apart.

So `isRef` and `RefValue` are exported from `@pikku/core/workflow` instead, and the inspector imports them rather than keeping its own copy.
