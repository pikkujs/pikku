---
type: overview
title: Decisions
description: Rules chosen in deploy/deploy-core, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [An app-wired job inbox replaces the runtime dispatch shim](an-app-wired-job-inbox-replaces-the-runtime-shim.md) — When an app wires the remote queue-job or scheduler-job route itself, the Cloudflare adapter stops mounting its own shim ahead of routing
- [Contributors declare needs and provides; addons ship them in package.json](contributors-declare-needs-and-provides.md) — Platform service contributors are ordered by what they read and set, fail loudly on gaps, and an addon declares its own under pikku.contributors rather than through wireAddon

<!-- /pikku:knowledge-index -->
