---
'@pikku/inspector': patch
'@pikku/deploy': patch
'@pikku/cli': patch
---

A deployment unit records why it is where it is. `DeploymentUnit` gains `groupedBy` — the `deploy.grouping` rule that put its functions together — and `targetForcedBy` — the `serverlessIncompatible` services that crossed it to `target: 'server'`. Both are absent for the fallback and for a target that was chosen rather than forced, so anything reading a manifest can tell a deliberate `server` unit from a crossed one. `resolveDeployTarget` now shares `incompatibleServicesFor` with the analyzer, so resolving a target and explaining it cannot drift.
