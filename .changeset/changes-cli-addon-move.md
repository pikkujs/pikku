---
'@pikku/cli': patch
'@pikku/addon-changes-cli': patch
---

`pikku changes` moves out of the CLI into `@pikku/addon-changes-cli`, which the CLI wires as an addon. The command group, its flags and its output are unchanged. The CLI gains `@pikku/cli/addon-support` and `@pikku/cli/addon-support/validate` for addons that contribute commands, and a backend registry (`@pikku/addon-changes-cli/backend`) through which the cloud commands still in the CLI back `pikku changes` with Pikku Studio Cloud.
