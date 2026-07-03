---
'@pikku/addon-console': patch
---

Fix "pikku.config.json not found" on installAddon/installOpenapiAddon (and a matching bug in createSingletonServices' projectRoot for StateDiffService/CodeEditService) in monorepo layouts. These derived the project root as `dirname(metaService.basePath)`, which is only correct when `.pikku` sits directly next to pikku.config.json. In Fabric sandboxes (basePath is `packages/functions/.pikku`), that resolved to `packages/functions` instead of the real root, so pikku.config.json was never found. A new findProjectRoot() walks up from basePath looking for pikku.config.json, matching the CLI's own findConfigFile() behavior.
