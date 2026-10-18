---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

Printed unions now list their members alphabetically, with `null` and `undefined` last, in both inspectors. A union's order used to follow which file the type checker reached first, so it could differ between Node and Bun, and between the TypeScript and native inspectors, and with it the generated schema's `enum` and the function's contract hash. CLI `choices` taken from a union of string literals are sorted the same way; an `enum` keeps its declaration order.

The first codegen after upgrading reorders those unions once. A function whose input or output is an inline union that was not already in this order gets a new contract hash, so a `versions.pikku.json` that recorded the old one reports it as modified.
