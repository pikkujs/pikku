---
type: question
title: Does the edge runtime check ever receive an app's allowInMemory list?
description: The verifier accepts an allowInMemory option and the edge rule reads it, but no code in the CLI sets it, so a class an app lists would still be flagged at build time
tags: cli, deploy, edge, in-memory, verifier
---

# Does the edge runtime check ever receive an app's allowInMemory list?

The edge rule in `packages/deploy/deploy-core/src/runtime-verify.ts` flags every `InMemory*` class in an
edge unit's bundle unless it is in `allowInMemory` (`runtime-verify.ts:310-314`). The fix text tells the
user to list the class in "the unit's allowInMemory" if it is intentionally ephemeral (`runtime-verify.ts:378`).

The CLI wrapper declares the option (`packages/cli/src/deploy/runtime-verifier.ts:50-51`) and forwards it
into the analysis (`runtime-verifier.ts:169`).

Nothing upstream sets it. `verifyUnitsRuntime` takes no such option (`runtime-verifier.ts:185-193`), and its
call to `verifyUnitRuntime` passes the unit, entry, project, profile, tier and dead patterns, but not
`allowInMemory` (`runtime-verifier.ts:205-214`). The build passes the provider, units, entry files, project
directory and dead-pattern callback to `verifyUnitsRuntime` (`packages/cli/src/deploy/build-pipeline.ts:686-691`).
A search of the repository for `allowInMemory` outside tests finds only the declarations and forwards above,
and the deploy-core rule. The deploy-core test sets the list directly (`packages/deploy/deploy-core/src/runtime-verify.test.ts:210`).

Question: is `allowInMemory` meant to come from a unit or app configuration that the build should read, or
is the escape hatch unused, so that a listed class is still a build failure?

**What this rules out, if the answer is "not meant to be read":** treating the message's advice as a working
escape hatch. The fix text would then be wrong.
