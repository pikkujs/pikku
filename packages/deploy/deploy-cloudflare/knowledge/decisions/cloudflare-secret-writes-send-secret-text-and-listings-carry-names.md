---
type: decision
title: Cloudflare secret writes send secret_text, and listings return names and types only
description: setSecret PUTs a secret_text binding to the Workers API, and listSecrets is documented to return names and types without values
tags: [deploy, cloudflare, secrets]
---

# Cloudflare secret writes send secret_text, and listings return names and types only

`setSecret` in `packages/deploy/deploy-cloudflare/src/secrets.ts` sends a `PUT` to
`/workers/scripts/<name>/secrets` with a body of `{ name, text, type: 'secret_text' }`
(lines 21-25). Its doc comment says the value "is encrypted at rest by Cloudflare and is
never returned by any API call" (lines 7-8).

`listSecrets` (lines 55-60) is documented as returning "only secret names and types"
(lines 49-53) and is typed as `WorkerSecretEntry[]`. The function body is a single `GET`.

**What this rules out:** reading a Worker's secret values back through this module.
