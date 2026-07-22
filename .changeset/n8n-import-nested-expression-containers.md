---
'@pikku/n8n-import': patch
---

Lower n8n expressions nested inside array/object parameters instead of emitting them raw

`classifyExpression` only inspects strings, so a parameter holding an expression
inside a container — `recipients: ["={{ $json.body.email }}"]` — classified as a
literal and the raw expression string was emitted verbatim into generated code.
`emitValue` now recurses element-wise into containers that carry an expression,
lowering each member to `ref()`/`template()`. Containers with no expression
inside keep the original `safeJson` path, so existing emissions are unchanged.

Also exports the naming helpers (`sanitizeIdentifier`, `integrationRpcName`,
`codeRpcName`, …) so a second importer normalizing onto the same IR emits
identical identifiers and can share a project without colliding.
