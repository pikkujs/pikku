---
'@pikku/cucumber': patch
---

Deprecate `@pikku/cucumber` in favour of `pikkuScenario` / `pikkuScenarioStep`.

Pikku's own end-to-end suite no longer uses it. The package stays published so
existing suites keep building and receives no new features; `Actor` and the
barrel now carry `@deprecated` JSDoc pointing at scenario actors. Run
`npm deprecate @pikku/cucumber@'*'` alongside this release.
