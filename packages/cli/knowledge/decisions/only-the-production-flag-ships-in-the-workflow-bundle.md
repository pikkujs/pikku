---
type: decision
title: Only the production flag of each environment ships in the workflow bundle
description: serializeVirtualUsers projects each environment down to its production flag, so the deployed bundle does not carry apiUrl or paths from pikku.config.json
tags: cli, virtual-users, workflow, bundle
---

# Only the production flag of each environment ships in the workflow bundle

`serializeVirtualUsers` in `packages/cli/src/functions/wirings/workflow/serialize-virtual-users.ts`
maps each environment to `{ production: true }` or `{}`. The comment says the rest of an
environment entry is its apiUrl and paths, which belong to the machine running
`pikku scenario` and have no business inside the deployed bundle.

The projected object is written as `virtualUserEnvironments`. The comment there says the
run-time check does not trust which artifact got deployed, so the rule needs the
production flag inside the bundle.

**What this rules out:** local machine URLs in a deployed artifact, and a runtime that
cannot tell a production environment from a test one.
