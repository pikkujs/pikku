---
type: decision
title: Workflows own the lease table too
description: `leaseSchema` is owned by `workflowService` as well as `leaseService`, because the engine takes the run lease without any function ever naming leaseService
tags: [leases, workflows, schema]
---

# Workflows own the lease table too

`pikku db generate` writes a schema for a project only when a service in
`ownedBy` is one the inspector found the project's code reaching. The workflow
engine takes `workflow-run:<id>` from `leaseService` on every orchestration pass,
but no function destructures `leaseService` to make that happen, so a workflow
project was never given `pikku_lease` — and registering a lease service then
failed at boot against a table nothing had migrated.

`leaseSchema` is therefore owned by `workflowService` as well. A workflow project
gets the table whether or not it registers a lease service yet.

**What this rules out:** making `leaseService` a required service of every
workflow project. That would force the in-memory and single-process apps, which
have nothing to serialise, to wire a lease they cannot use.
