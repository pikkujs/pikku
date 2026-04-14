---
"@pikku/cli": patch
---

Enrich generated workflow status stream with step-level progress. The `/stream` endpoint now sends step names and statuses via `workflowRunService.getRunSteps()`. New `/stream/full` endpoint includes output, error, and childRunId for admin consoles.
