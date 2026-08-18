---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/deploy-cloudflare': patch
---

Fix seven defects found taking one project through `pikku fabric` to deploy

**`deploy plan` rewrote the project's own scaffold.** Per-unit codegen re-runs
`pikku all` with `--outDir` pointed at a unit's `.pikku`, and scaffold imports
are computed against `config.outDir` — so `console.gen.ts` came back importing
`../../../../../.deploy/cloudflare/units/<unit>/.pikku/pikku-types.gen.js` and
the source stopped typechecking until the next ordinary `pikku all`.

A guard for this already existed in four generators and had never once fired:
`LocalVariablesService.get` runs values through `JSON.parse`, so
`PIKKU_DEPLOY_CODEGEN=1` arrived as the number `1` and every `=== '1'` test
was false. The comparison is fixed behind a shared `isDeployCodegen`, and the
real guard now sits in the file writer, which refuses writes _and removals_
under the scaffold directory for the duration of a per-unit run. Guarding the
writer rather than each generator matters here: seven further generators had no
guard at all, several write scaffold source and `.pikku` artifacts in the same
pass (so an early return would skip too much), and the legacy-scaffold pruners
delete from the source tree without going through a generator.

**`fabric validate` passed on a project that could not deploy.** Deploy clones
the repository, so a `pikkufabric.config.json` that exists only in the working
tree is absent exactly when it is needed, and the build container aborts with
`pikkufabric.config.json not found in repository root`. Validate now reports
that as an error, and its success line distinguishes "can be linked" from
"will deploy" instead of reporting unqualified success at a project that is not
linked yet.

**`description` reached `infra.json` as raw source.** `getPropertyValue` fell
back to `node.getText()`, which is indistinguishable from the value for a lone
literal — so nobody noticed that a description written as `'a ' + 'b'` arrived
with the quotes and the `+` still in it, and rendered that way in the console.
Compile-time constant strings are now folded, checker-free, so a node that
cannot be resolved statically still takes the old path.

**A wired addon that was not installed failed silently.** A missing package
makes `resolveAddonMeta` return null, which was caught and downgraded to a
warning; every `ref('<namespace>:…')` then resolved to nothing and the surface
was dead at runtime with nothing in the build output saying why. The generated
console is the common case. `wireAddon` now requires its package to be
installed (`PKU340`), the mirror of the existing `wireRemoteAddon` check whose
own docs already described this half as if it existed.

**The audit-table check demanded an unquoted identifier.** Kysely's schema
builder always quotes, so `create table "audit"` read as missing on the
projects most likely to have it. Both this and the better-auth table checks now
share one matcher that accepts each dialect's quoting — matched pairs only, so
`"audit'` is not a hit — plus an optional schema qualifier.

**Cloudflare bundles kept `pg`.** `getStubModules()` named `postgres` and
`kysely-postgres-js` but not `pg`, which is the more common driver in
application code, equally unreachable on a Worker, and additionally pulls at
`net`/`tls` and `pg-native`, which a Worker build cannot resolve at all.

**The deploy plan listed one secret twice.** Two `defineSecret` calls may
legally share a `secretId` under different local names — the auth scaffold's
`betterAuthSecret` alongside a hand-written one is the everyday case — and the
manifest mapped them straight through, so the plan printed two identical
`create` lines for one resource and `countUnchanged` counted it twice. Secrets
and variables are now deduplicated in the manifest itself, where variables were
already being collapsed by accident downstream.
