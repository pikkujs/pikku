---
type: overview
title: Decisions
description: How the OpenAPI parser's generated code places a caller's credential
---

# Decisions

<!-- pikku:knowledge-index -->
- [Generated clients place the credential by explicit header, then the apiKey scheme, then Bearer](generated-clients-place-the-credential-by-explicit-header-then-scheme-then-bearer.md) — codegen.ts picks the header that carries the caller's credential in a fixed order, and a delegated login also emits an upstream authenticate() file
<!-- /pikku:knowledge-index -->
