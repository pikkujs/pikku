---
type: decision
title: Writing Fabric project settings requires a stored login and a linked project
description: fabric config refuses a settings write without a token or a linked project, while a settings read is best effort and reports its error instead of failing
tags: cli, fabric, config
---

# Writing Fabric project settings requires a stored login and a linked project

The `fabric config` function in `packages/cli/src/fabric/functions/config.function.ts` has two
paths for settings.

A write (`set`) throws `FabricPreconditionError` when there is no token
(`config.function.ts:145-148`) and when there is no linked project, using the project error
text when one exists (`config.function.ts:149-153`). It then invokes `setProjectSettings`
(`config.function.ts:154-160`).

A read goes through `getProjectSettings` only when both a token and a project exist
(`config.function.ts:161-168`). A failure there is caught and stored as `settingsError`
(`config.function.ts:169-171`), so the result still returns with `settings` set to null.
`loggedIn` is `base.token !== null` (`config.function.ts:177`).

**What this rules out:** writing settings from a checkout with no login or no link, and failing
a whole status command because the settings read failed.
