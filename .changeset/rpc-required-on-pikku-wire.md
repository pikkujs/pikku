---
"@pikku/core": patch
---

Make `rpc` a required property on `PikkuWire`. It is always lazily initialised by the function runner on every invocation regardless of wire type, so marking it optional was misleading.
