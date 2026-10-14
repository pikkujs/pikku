---
type: overview
title: Decisions
description: Rules chosen in the Cloudflare deploy target, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [Cloudflare secret writes send secret_text, and listings return names and types only](cloudflare-secret-writes-send-secret-text-and-listings-carry-names.md) — setSecret PUTs a secret_text binding to the Workers API, and listSecrets is documented to return names and types without values
- [The generated wrangler.toml lists secrets as commented placeholders, not values](wrangler-toml-lists-secrets-as-commented-placeholders.md) — Secret names appear in the [vars] block as comments with a wrangler secret put hint, and no value is written
<!-- /pikku:knowledge-index -->
