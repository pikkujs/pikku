---
'@pikku/inspector': patch
'@pikku/addon-console': patch
---

Key `secretOverrides`/`variableOverrides` on the secretId/variableId (the string the addon actually reads by — its typed map is keyed by id, e.g. `getSecret('MAILGUN_CREDENTIALS')`), not the logical meta name. The runtime aliaser already keys on the id, but the inspector merge + validation keyed on the logical name, so a correctly-keyed override failed validation and never provisioned its target whenever an addon's logical name differed from its id (the common case — `mailgun`/`MAILGUN_CREDENTIALS`). The existing test masked it by using a secret whose name equalled its id. The merge now resolves and provisions by id (with a name-fallback for older meta), validation checks ids, and the console install codegen generates overrides keyed by id.
