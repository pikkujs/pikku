---
'@pikku/n8n-import': patch
---

Lower more n8n cross-node references to declarative `ref()`. The expression
classifier now recognises the item accessors that mean "this node's output
object" — `$('X').first().json.<path>`, the bare `$('X').json.<path>`
shorthand, and `.item` after `$node["X"]` — collapsing each to `ref(X, path)`
the same way `$('X').item.json` already did. These previously fell through to
`transform` and were dropped to a `// TODO(n8n expr)` comment, silently
removing the field from the emitted node input. `.last()` / `.all()` / indexed
accessors stay a transform (they assume item-array semantics the single-object
graph output doesn't carry). The coverage harness now reports the number of
dropped n8n expressions; this change removes 92 of them across the corpus.
