---
type: overview
title: Decisions
description: Rules chosen in deploy/deploy-core, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [An app-wired job inbox replaces the runtime dispatch shim](an-app-wired-job-inbox-replaces-the-runtime-shim.md) — When an app wires the remote queue-job or scheduler-job route itself, the Cloudflare adapter stops mounting its own shim ahead of routing
- [A host supplies platform services from one module](a-host-supplies-platform-services-from-one-module.md) — A deploy provider, or the --platform-services option locally, names a real module whose createPlatformServices runs last and may replace any service
- [Built-ins are Node's, not the build runtime's](builtins-are-nodes-not-the-build-runtimes.md) — The CLI re-execs under Bun, whose builtinModules also lists ws, undici and bun:*; the tier check and the externals use Node's list only

<!-- /pikku:knowledge-index -->
