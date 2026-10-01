---
'@pikku/core': patch
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Scenario coverage moves into OSS. `@pikku/core/scenario/coverage` adds `readScenarioCoverage`, which reports the lines no scenario reaches, the mutations no scenario drives, and the pages scenarios open. It is exposed through `pikku scenario coverage`, `console:getScenarioCoverage`, and a "Not tested by any scenario" card on the Scenarios page. `LocalMetaService.getRpcMeta` now reads the `.internal.gen.json` file that codegen actually writes.
