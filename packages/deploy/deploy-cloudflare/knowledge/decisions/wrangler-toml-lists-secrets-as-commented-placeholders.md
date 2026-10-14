---
type: decision
title: The generated wrangler.toml lists secrets as commented placeholders, not values
description: Secret names appear in the [vars] block as comments with a wrangler secret put hint, and no value is written
tags: [deploy, cloudflare, secrets]
---

# The generated wrangler.toml lists secrets as commented placeholders, not values

In `packages/deploy/deploy-cloudflare/src/wrangler-toml.ts`, when the manifest has secrets,
the generator writes a `[vars]` header (line 142). It then writes one line per secret
(lines 143-145) of the form `# <secretId> = "" # Set via wrangler secret put`.

The line is a comment, and it carries only the secret's identifier and an empty string. The
function reads `secret.secretId` and nothing else from the manifest entry, so the value
never reaches the file.

**What this rules out:** writing a secret value into the generated wrangler.toml. The value path is `setSecret` in `secrets.ts`, a separate module (see cloudflare-secret-writes-send-secret-text-and-listings-carry-names).
