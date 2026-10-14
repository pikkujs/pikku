---
type: question
title: Should session tables be kept out of the scenario baseline by default?
description: The baseline module documents session tables as belonging in keep, but the one caller passes only the user's config, so nothing keeps them unless the project does
tags: cli, scenarios, database, auth
---

# Should session tables be kept out of the scenario baseline by default?

`ScenarioBaselineOptions.keep` is documented as the place for session tables. The
comment says an actor signs in once for the run, and restoring a baseline taken
before that sign-in logs every actor out mid-suite
(`packages/cli/src/functions/db/scenario-baseline.ts:23-31`).

The only production caller passes the user's own config straight through:
`captureScenarioBaseline(resolved, config.scenarios.reset)`
(`packages/cli/src/functions/commands/scenario.ts:530-532`). Nothing in that
call adds a session table to `keep`. The test that exercises `keep: ['session']`
passes it explicitly (`packages/cli/src/functions/db/scenario-baseline.test.ts:87-88`).

So the baseline keeps session tables only when a project lists them. Whether the
default should keep them is not settled in code. The current behavior is kept
until someone decides otherwise.
