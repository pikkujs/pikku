---
'@pikku/cli': patch
---

The CLI's own commands now generate every schema their contract names. Seven input types were declared but not exported (`AuditInput`, `EmailsInitInput`, `InfoInput`, `LoginOptions`, `CLITypesCommandInput`, `AddonTypesCommandInput`, `WorkflowCommandInput`), `scenarioRun` named `ScenarioSurface` from another package, and `scenarioCoverage` returned a type from another package's declaration file; the schema generator found none of them, so `pikku all` on the CLI itself reported PKU463 and PKU456. Exporting the types, spelling the surface union out, and declaring `ScenarioCoverageReport` locally clears both.
