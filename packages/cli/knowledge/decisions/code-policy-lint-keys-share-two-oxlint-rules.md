---
type: decision
title: The four code-policy lint keys share two oxlint rules, and process.env moved off node/no-process-env
description: lint.enforceContentService, enforceVariablesService, enforceSupervisor and enforceCliCommands are required as entries of no-restricted-imports and no-restricted-properties; exemptions are plain oxlint comments plus one bootstrap override
tags: cli, validate, lint, oxlint
---

# The four code-policy lint keys share two oxlint rules, and process.env moved off node/no-process-env

`OXLINT_POLICY_RULES` has four keys: `enforceContentService` (fs), `enforceVariablesService` (`process.env`), `enforceSupervisor` (`child_process`) and `enforceCliCommands` (`process.argv`). Each lists the entries it needs in `no-restricted-imports` (module paths, optionally `importNames`) and `no-restricted-properties` (`object.property`). oxlint takes one value for each rule, so `activePolicyRules` concatenates the entries of the active keys, at the strictest of their levels, and the check asks per key whether its own entries are present (`missingPolicyEntries`). A key at `warn` next to a key at `error` therefore reports its sites as errors; the finding ids stay per key.

**`process.env` uses `no-restricted-properties`, not `node/no-process-env`.** `node/no-process-env` reports `process.env.X` only. `no-restricted-properties` on `{ object: 'process', property: 'env' }` also reports `{ ...process.env }`, `const { env } = process` and `process['env']`, probed on the pinned oxlint 1.88.0. The node rule is not accepted as an alternative: accepting it would let a config pass that misses the spread, which is the shape that leaks the whole environment. An app upgrading gets `oxlint-enforce-variables-service` until `pikku enable oxlint` adds the entry; it also removes a `node/no-process-env` set to `"error"`, which would report every site twice. The `node` plugin is no longer needed.

**Verified on 1.88.0, and kept:** static `import`, `await import()`, `export ... from`, `import x = require()` and (through `typescript/no-require-imports`, not `no-restricted-imports`) `require()`; `allowTypeImports`; `importNames` for `parseArgs` from `node:util`; `Bun.spawn`, `Bun.spawnSync`, `Bun.$`, `Bun.argv`, `Deno.args`, `process.argv`; `// oxlint-disable-next-line <rule> -- reason` for both rules, in `.ts` and `.tsx`.

**`globalThis` forms:** oxlint 1.88.0 does not match a dotted `object` (`globalThis.process` never fires), but `{ object: 'globalThis', property: 'process' }` does, as do `Bun` and `Deno`. The rules therefore restrict `globalThis.process`, `globalThis.Bun` and `globalThis.Deno` as whole properties, which also reports `globalThis.process.cwd()` and `typeof globalThis.Bun`. That is the price of catching `globalThis.process.env`; one line is exempted with the plain disable comment.

**Not caught:** an aliased object (`const b = Bun; b.argv`), `global.process`, `self.process`, `Bun.file` and other runtime file APIs. A rule that needs them is a JS plugin, not an inspector walk.

**Exemptions are plain oxlint disable comments, plus one bootstrap override.** `pikku enable oxlint` and `create-pikku` write an `overrides` entry turning the policy rules off for `**/start.ts`, `**/server.ts`, `**/bin/**`, `**/scripts/**` and `*.test.*` / `*.spec.*`. There is no exemption for a services directory or the services factory: the factory reads `variables` like everything else. There are no exemption finding ids, no listing of exemptions, no refusal of an override and no required reason; those were considered and left out to keep the change small.

**Not enrolled:** packages that are developer tools rather than addons or apps (`@pikku/cli`, the console, `pikku-changes-cli`, `pikku-cloud-cli`) set the keys they cannot meet to `'off'` in their own `pikku.config.json`.

Supersedes the `node/no-process-env` detail of [Single-file lint rules live in oxlint](single-file-lint-rules-live-in-oxlint.md).
