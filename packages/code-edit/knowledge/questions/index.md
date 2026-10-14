---
type: overview
title: Questions
description: Things asked of code-edit and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Does the source-path guard accept sibling directories that share the root's prefix?](does-the-source-path-guard-accept-sibling-prefixes.md) — resolvePath checks startsWith on the root with no path separator, so a sibling directory whose name begins with the root name passes
- [Should brand image downloads refuse private-network addresses?](should-brand-image-downloads-refuse-private-addresses.md) — saveRemoteImages fetches every caller-supplied URL with the global fetch, bounded by timeout and size but not by host
<!-- /pikku:knowledge-index -->
