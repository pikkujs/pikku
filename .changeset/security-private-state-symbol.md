---
"@pikku/core": patch
---

Use private Symbol for global pikku state key to prevent external code from accessing framework internals via Symbol.for().
