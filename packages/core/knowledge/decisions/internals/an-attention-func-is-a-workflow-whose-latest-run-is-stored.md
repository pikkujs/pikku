---
type: decision
title: An attention func is a workflow whose latest run is stored
description: A widget says whether it needs a look through pikkuAttentionFunc; each run is a retried get step then a store step, kept per project and widget, and the host reads the stored result
tags: core, attention, workflow, addon
---

# An attention func is a workflow whose latest run is stored

`pikkuAttentionFunc({ widget, every, func })` declares whether one widget of an addon's arranged screens needs a look. It exists for the host's "Needs attention" view, which lists the widgets that do across every screen a person may see.

**Why a separate func and not the screen's own source.** A host that opened every screen's full source to find the few that need a look would run as many page loads as there are screens. The func reads the cheap facts and returns a number the host can rank: `score` 0..1, comparable across addons, plus `reason`, `impact` and `since` for the sorts a card cannot express.

**Why a workflow.** The func reads through the project's usual functions, which fail for ordinary reasons. A workflow gives the get step retries and makes each step visible in the run list, so a widget that keeps failing is something a person can see rather than a gap. The workflow is `attention.<widget>`, registered when `addAttentionFunc` runs, with a get step (`Check <widget>`, retried) and a store step (`Store <widget>`).

**Why stored results.** Nothing is checked when a person looks. Every run is stored per project and widget with `updatedAt`, and `getAttention` reads the latest. A get step that still fails after its retries stores `failed` with the error, so the host shows "couldn't check" instead of hiding the widget. The store is the `attentionResults` service, with an in-process default.

**Why the schedule refreshes only projects that asked.** A func takes a `projectKey`, and the process does not know which projects exist. `refreshAttention` records the project against the widget, and the scheduled task (`attention.<widget>.refresh`, cron derived from `every`) starts the workflow for each recorded project.

**Rejected.** Cron expressions in `every`: a duration is what the author means, and seconds are refused because a cron cannot express them. Reading `widget` by running the module: `pikku all` reads it from source, so it can name the widget and the plugin before anything runs. Storing nothing and recomputing at read time: that is the cost the func exists to avoid.

**Gotcha.** `widget` and `every` are read statically and must be string literals. The CLI reads `*.attention.ts` files itself instead of the inspector, so a declaration outside such a file is refused.
