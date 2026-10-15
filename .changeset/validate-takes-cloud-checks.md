---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku cloud validate` is merged into `pikku validate`, which gains `--skip-typecheck`, `--skip-deploy-checks` and `--migrations-base`. The deploy-readiness checks run as a `project-checks` entry in the validate registry; the checks that need a Pikku Studio Cloud project (migration drift against the deployed stages, and the project-link findings) are passed in as a `projectChecks` hook, and a hook that throws becomes a `project-checks-skipped` finding — an info for `pikku validate`, an error for a deploy. The skills and knowledge notes now say `pikku validate`.
