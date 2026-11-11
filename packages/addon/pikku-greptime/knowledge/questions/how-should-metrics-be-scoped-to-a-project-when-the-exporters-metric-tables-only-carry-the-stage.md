---
type: question
title: How should metrics be scoped to a project, when the exporter's metric tables only carry the stage?
description: the store scopes its own metric writes by a pikku_project tag; the app exporter's tables have none, so they are stage-scoped only
tags: [metrics, scope, isolation, greptime]
---

# How should metrics be scoped to a project, when the exporter's metric tables only carry the stage?

GreptimeDB v1.3.0 turns an OTLP metric into a table whose columns are the data point
attributes plus `deployment_environment_name`; resource attributes such as
`pikku.project` and `pikku.stage` do not become columns. The store therefore writes
`pikku.project` as a data point attribute and filters on it where the column exists.

A table written by something else (the app's own OTLP exporter) has no project column.
The store then reads it by stage only, so two projects that use the same stage name and
one GreptimeDB share those metric points. Logs and traces are not affected: their
resource attributes are real columns.

Options: make the exporter add `pikku.project` as a data point attribute; require one
database per project (the contributor's `PIKKU_GREPTIME_DB` already allows it); or
accept stage-only scoping for exporter metrics. Current behaviour: stage-only for those
tables, project and stage for the store's own. Needs an owner decision.
