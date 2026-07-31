---
type: decision
title: Scenario meta lives apart from app meta but merges when read off disk
description: Scenarios generate into .pikku/scenarios so no app module imports them, yet MetaService folds them back into the workflow and function meta
tags: services
---

# Scenario meta lives apart from app meta but merges when read off disk

Scenario workflows and scenario steps are generated into `.pikku/scenarios/`
rather than alongside the app's own `workflow/` and `function/` meta. The split
exists at the import level: nothing app-facing should pull a scenario into a
production bundle.

The split does not exist at the meta level. `LocalMetaService.getWorkflowMeta`
reads both `workflow/meta` and `scenarios/meta`, and `getFunctionsMeta` reads
both `pikku-functions-meta` and `pikku-scenario-functions-meta`
(`packages/core/src/services/meta-service.ts`). Anything reading meta off disk —
the console's scenario list first among them — is entitled to see scenarios,
because to a meta reader they simply are workflows and functions.
`packages/core/src/services/meta-service.test.ts` guards this.

**What this rules out:** dropping the second read on the grounds that the app
never registers scenario workflows, and "tidying" the two meta directories into
one. The two reads are the seam: separate on disk and in the import graph,
merged in `MetaService`.
