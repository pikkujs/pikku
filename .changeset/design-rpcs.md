---
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/code-edit': patch
---

`pikku dev` starts the design server from `@pikku/studio` when Studio runs the project or the project has it installed. The console addon gains design RPCs: list, create, switch and delete themes, read and update the active theme spec, read and edit literal JSX props at a source location, and find the running design server.
