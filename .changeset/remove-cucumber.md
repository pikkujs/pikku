---
'@pikku/cli': patch
'create-pikku': patch
'@pikku/skills': patch
'@pikku/playwright': patch
---

`@pikku/cucumber` is removed from the repo and deprecated on npm. Its final release (0.12.18) was already an empty stub; nothing in Pikku depends on it. Pikku end-to-end tests are written with `pikkuFeature` / `pikkuScenario` and `pikkuScenarioStep`, which are typed Pikku functions run by `pikku scenario run`; there is no Gherkin, step-definition registry or World. The scenario skill, knowledge decisions and `create-pikku` starter description no longer mention Cucumber.
