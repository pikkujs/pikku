---
type: overview
title: Decisions
description: Rules chosen in deploy/deploy-core, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [An app-wired job inbox replaces the runtime dispatch shim](an-app-wired-job-inbox-replaces-the-runtime-shim.md) — When an app wires the remote queue-job or scheduler-job route itself, the Cloudflare adapter stops mounting its own shim ahead of routing
- [Services are declared with defineProvider and a provider reports what its entry holds](providers-are-declared-with-defineprovider-and-opted-in-by-name.md) — A deploy provider describes its runtime through serviceSupport (baseline keys and whether the server lifecycle runs); one resolver in the CLI orders, checks and writes the services for every provider
- [An entry-owned key cannot be replaced by a provider](an-entry-owned-key-cannot-be-replaced-by-a-provider.md) — serviceSupport reports the keys an entry opens itself (the standalone kysely, and dev's when the project has a db section); a provider providing one is PKU397, so a database addon has no deploy:standalone variant

<!-- /pikku:knowledge-index -->
