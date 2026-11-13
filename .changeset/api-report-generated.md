---
'@pikku/core': patch
---

`packages/core/api-report.md` is no longer checked in. The `API report` workflow builds it from a pull request's base and merge result and posts the diff as one sticky PR comment, so reviewers still see public-API changes without a 7000-line file to rebase. The pre-commit regeneration, the `api-report.test.ts` staleness test and the `merge=api-report` driver are gone, and `generate-api-report.mts` takes an optional output path.
