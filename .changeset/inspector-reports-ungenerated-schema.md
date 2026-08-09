---
'@pikku/inspector': patch
---

**Codegen reports a schema it named but never generated (PKU463).** A named
contract type that is declared but not exported is imported by the virtual
source file the schema generator compiles, resolves to nothing, and yields no
schema — while the function meta still carries the name. `pikku all` exited 0
and the first call to that function failed in a deployment with
`MissingSchemaError`. The reference is now checked once addon schemas are
merged, since an addon supplies its own and checking earlier would report every
one of them as unresolved.
