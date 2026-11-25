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

<!-- /pikku:knowledge-index -->
