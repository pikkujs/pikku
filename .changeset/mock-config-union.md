---
'@pikku/cli': patch
---

`pikkuFunc` and `pikkuSessionlessFunc` take the mock declaration as part of the config parameter instead of a separate overload. A body that returns a literal under explicit generics, such as `pikkuFunc<null, { pong: true }>`, keeps its literal type, and a bad `scopes` or `permissions` value is reported on that property.
