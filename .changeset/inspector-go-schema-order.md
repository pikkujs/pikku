---
'@pikku/inspector-go': patch
---

The Go inspector prints unions and mapped-type properties in the same order as the TypeScript inspector, so schema `enum` and `required` arrays, and the contract hashes built from them, match.
