---
'@pikku/n8n-import': patch
---

The n8n coverage harness now classifies by-design-unimportable workflows (instance-local sub-workflow refs, mid-flow `respondToWebhook`) as a distinct `skipped` outcome via a typed `UnsupportedTopologyError`, separate from real failures.
