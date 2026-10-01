---
'@pikku/cli': minor
---

`pikku validate` now errors when scaffold output also exists somewhere else in the project. A generated scaffold file (console, rpc, agent, workflow, events, auth and the rest) sitting outside the scaffold directory `pikku all` writes it to is reported as `scaffold-output-outside-scaffold-dir`, and a hand-written `wireAddon` for an addon the scaffold already wires (`console`, `graph`) is reported as `scaffold-addon-declared-twice`. Both name the two locations and say to delete the stray copy and run `pikku all`; a `defineRoles` grant of the addon's scope is not a duplicate. A scaffold directory other than `<first srcDirectory>/scaffold` is reported as the warning `scaffold-dir-noncanonical`.
