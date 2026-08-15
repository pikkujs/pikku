---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/inspector': patch
---

The CLI, the inspector and the console reach core only through `@pikku/core/ecosystem/*`

The last three trees in the extender tier. 69 specifiers across 41 files now
point at a facade instead of a raw subpath, and the guard test in core covers
all six trees rather than three.

Twenty names had no facade at all and were added to the one for their **domain**,
the same rule the services and addons migration settled on: `pikkuCLIRender` to
`ecosystem/cli`, `pikkuDevReloader` to `ecosystem/dev`, `PersonaMeta` and
`isRunnablePersona` to `ecosystem/persona`, `PikkuRPC` to `ecosystem/rpc`,
`getSchema` to `ecosystem/schema`, and the four virtual-user derivation and
target helpers to `ecosystem/virtual-user`. The in-memory service
implementations follow their domain rather than the directory they live in:
`InMemoryQueueService` to `ecosystem/queue`, `InMemoryTriggerService` to
`ecosystem/trigger`, `InMemoryWorkflowService` to `ecosystem/workflow`.
`ClassificationManifest` joins `ecosystem/types`, and what has no domain of its
own — `NoopAuditService`, `ConsoleLogger`, `LocalEmailService`, `isTestRun` —
joins `ecosystem/services`. `ecosystem/services/local-meta` is a new facade
mirroring the raw `services/local-meta` subpath the dev and serve commands used.

Generated files are deliberately untouched. What a `.gen.d.ts` under
`packages/cli/src` or `packages/console/src` imports is decided by the codegen
templates in `packages/cli/src/functions`, and those serve the app tier, which
is moving to the `#pikku` alias rather than to `ecosystem/*`. The guard test
skips `.gen.*` and `.d.ts` for the same reason.
