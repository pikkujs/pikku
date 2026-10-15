---
type: decision
title: A platform scenario step is declared on the default surface only, and the catalogue exclusion lives in core
description: The pikkuPlatformScenarioStep wiring sets surfaces to default and does nothing else about virtual users; keeping it out of a virtual user's catalogue is enforced by core derivation
tags: cli, virtual-user, scenario
---

# A platform scenario step is declared on the default surface only, and the catalogue exclusion lives in core

`pikkuPlatformScenarioStep` in `packages/cli/src/functions/wirings/workflow/serialize-scenario-types.ts` is a plain constructor. It returns the config with `surfaces: ['default']` and nothing else. It does not check who may call the step.

The doc comment above it says the step is local-test-only and never in a virtual user's catalogue, because a virtual user that could invoke it would forge its own outcome. That exclusion is enforced in core, not in this file: `deriveCatalogue` in `packages/core/src/wirings/virtual-user/virtual-user-derive.ts` skips every function carrying `scenarioStep` or `scenarioStepKind`, platform steps included, as recorded in [A virtual user is never offered a scenario, platform or addon step](../../../core/knowledge/decisions/security/a-virtual-user-is-never-offered-a-step-that-would-forge-its-own-oracle.md).

So this file's role is only the declaration shape. A change that made the constructor add the step to a catalogue, or that dropped the `surfaces` default, would be a change to the declaration, and the catalogue exclusion would still have to hold in core.

**What this rules out:** relying on the constructor to hide the step from virtual users. The guard is at derivation, so a caller that builds the catalogue another way does not get a free pass.
