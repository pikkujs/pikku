---
'@pikku/cli': patch
'@pikku/create': patch
'@pikku/skills': patch
---

User-facing text no longer names Fabric where it means a deploy host: `pikku validate` findings, `pikku changes next` messages, `create-pikku` template help, the starter template's name and knowledge profile, and the docs and skills that described Fabric as the platform. The `pikku fabric` commands, the `FABRIC_*` variables and the `fabric.config.json` / `pikkufabric.config.json` file names are unchanged.
