---
type: decision
title: Pikku carries virtual user scopes as data and the app grants them
description: scopes and roles on a ScenarioVirtualUserConfig are transported, never applied — the app's own seed reads them back and performs the grant
tags: services
---

# Pikku carries virtual user scopes as data and the app grants them

`ScenarioVirtualUserConfig.scopes` and `.roles`
(`packages/core/src/services/virtual-users-service.ts`) come from
`pikku.config.json` and are carried through to `scenarioVirtualUserConfigs`. Nothing in
core reads them to grant anything. The app's seed reads them back off that config
and performs the grants itself.

Core cannot do the granting: which scope store exists, whether roles have been
created, and what a role means are all the application's own. Worse, a framework
that granted scopes would be a framework that can escalate a virtual user's privileges
from a config file — the one place where a scenario author would least expect a
security decision to take effect. Keeping the fields inert makes the grant an act
the app performs deliberately, in code it owns, against a store it wired.

**What this rules out:** teaching `createHttpScenarioVirtualUsers` (or any core service)
to call `ScopeService.addScopeToUser` / `addUserToRole` from these fields, and
treating a scope listed on a virtual user config as evidence that the virtual user holds it.
If a scenario fails on a missing scope, the fix is in the app's seed, not here.
