---
type: overview
title: Decisions
description: Rules chosen in deploy/deploy-core, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [An app-wired job inbox replaces the runtime dispatch shim](an-app-wired-job-inbox-replaces-the-runtime-shim.md) — When an app wires the remote queue-job or scheduler-job route itself, the Cloudflare adapter stops mounting its own shim ahead of routing
- [Contributors are declared in code with defineContributors and opted in by name with wireAddon](contributors-are-declared-in-code-and-opted-in-by-name.md) — A platform-service contributor is a plain object an addon registers in code; a project takes only the ones it lists in wireAddon, and one resolver orders, checks and writes them for dev and every deploy

<!-- /pikku:knowledge-index -->
