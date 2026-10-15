---
type: overview
title: Decisions
description: Rules chosen in n8n-import, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [An n8n HTTP tool resolves its auth from a secret at runtime, and OAuth2 or custom auth stays a stub](an-n8n-http-tool-resolves-its-auth-from-a-runtime-secret.md) — An agent-tool HTTP request reuses the main HTTP Request auth recipes, so its credential is a secret name resolved when the tool runs
- [An unknown predefined n8n credential gets a stub, not a bearer guess](an-unknown-predefined-n8n-credential-gets-a-stub.md) — A predefined n8n credential type missing from the table produces no auth recipe, so the node stays a throwing stub
- [Each distinct n8n credential becomes one addon instance, and nodes that share it share that instance](each-distinct-n8n-credential-becomes-one-addon-instance.md) — Credential instances are deduplicated by credential type and id or name, and each node is bound to the first instance that matches it
- [An n8n HTTP auth descriptor carries secret names and constants, never secret values](n8n-http-auth-descriptors-carry-names-not-values.md) — HttpAuthDescriptor holds the credential name and static fields, and the secret is read from the SecretService at request time
- [An HTTP Request node maps to the native HTTP call only when it has no auth or a static auth recipe](only-no-auth-or-recipe-backed-http-request-nodes-map-natively.md) — parse-n8n gives an HTTP Request node the native http role when it is unauthenticated, or when httpAuthRecipe returns a recipe; otherwise it stays an integration stub
- [The n8n export carries a credential pointer, not a secret, so the import provisions the name and the user fills the secret in](the-n8n-export-carries-a-credential-pointer-not-a-secret.md) — Credential derivation works from the id, name and type of a credential reference, and the secret is entered once, outside the import
<!-- /pikku:knowledge-index -->
