---
'@pikku/cli': patch
---

The `mock: true` overloads of `pikkuFunc` and `pikkuSessionlessFunc` come first and type `func` like a real body, so a mock overload tried before the real one does not widen the literal a real body returns (`pikkuFunc<null, { pong: true }>`), and the real overload stays last so a bad `scopes`, `permissions` or `node.category` value is reported on that property.
