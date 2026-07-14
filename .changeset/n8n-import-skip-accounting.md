---
'@pikku/n8n-import': patch
---

feat(n8n-import): distinguish by-design skips from real failures in the harness

A workflow that emits nothing solely because it calls a sub-workflow living in
the author's n8n instance (referenced by instance-local id, never exported) or
chosen at runtime is un-importable by design, not an importer defect. Likewise
a mid-flow `respondToWebhook` has no Pikku equivalent. The coverage harness now
classifies both as a distinct `skipped` outcome rather than `failed`, so the
headline reflects genuine defects. `parseN8n` throws a typed
`UnsupportedTopologyError` (exported) for by-design-unsupported topologies so
callers can tell them apart from malformed input.
