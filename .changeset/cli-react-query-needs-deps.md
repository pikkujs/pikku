---
'@pikku/cli': patch
---

Generate the React Query hooks only when `@tanstack/react-query` and `@pikku/react` can be resolved from the project. Every backend's SDK now names the file, so a project without React Query got a generated file importing packages it does not have, failing its type-check.
