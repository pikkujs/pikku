---
type: decision
title: Scenario prose is rendered out of typed calls, not parsed into them
description: The inversion of cucumber — a readable report with no regex step registry to maintain
tags: workflow
---

# Scenario prose is rendered out of typed calls, not parsed into them

`scenario-prose.ts` renders the English sentence a reporter shows for a scenario
step. It is the inversion of cucumber: instead of parsing English into a call
through a registry of regexes, the call is typed and the English is rendered out
of it. The readable report survives without anyone maintaining a step-definition
registry, and a step that no longer exists cannot leave a dangling phrase behind.

`renderScenarioProse` fills a step's `template` from the input the step was
actually called with, so the sentence names the values under test — "sees
@pikku/addon-todos" rather than "sees an addon in the gallery" three times over.
A placeholder with no recorded value renders as nothing and the surrounding
whitespace collapses, so an omitted optional input reads as a shorter sentence
rather than leaking a literal `{state}` into the report. `template` is
deliberately distinct from `description`: `description` documents what the step
does, `template` is what a reader of the report sees, and it falls back to
`description` when absent.

It lives in `@pikku/core` rather than in the CLI so the CLI reporter and the
console render the same sentence for the same step.

**What this rules out:** adding a gherkin parser or regex step registry,
rendering prose in the CLI reporter or console instead of core (the two would
drift), collapsing `template` into `description`, or making a missing
placeholder value render as the raw placeholder.
