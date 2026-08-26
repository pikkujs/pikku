---
'@pikku/console': patch
---

Fix the scenarios step panel throwing `useWorkflowContext must be used within WorkflowProvider` when a host mounts the panel container outside the surface that opened it. The step's workflow meta now travels on the panel data, and `ScenarioStepPanel` mounts its own provider from it, falling back to an ambient one.
