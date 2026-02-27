---
'@pikku/core': patch
---

Internalize singleton services management in the serverless channel runner, consistent with how other runners handle it. `createWireServices` and `singletonServices` no longer need to be passed explicitly to serverless channel runner calls.
