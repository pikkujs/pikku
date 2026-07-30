---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
'@pikku/cloudflare': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

**Breaking:** removed dynamic workflows — runtime-defined workflow graphs stored in the database and resolved by name instead of by codegen.

The feature was already half-gone. Its authoring surface (`createAgentWorkflow`, `saveAgentWorkflow`, `listAgentWorkflows`, `executeAgentWorkflow`, and the AI-agent instruction builder) was deleted in April 2026 along with its entire e2e suite, and nothing has written a dynamic workflow since. What remained could not execute one either: `executeAgentWorkflow` gated on `pikkuState('workflows', 'meta')`, which only codegen ever populates, so a graph that existed solely in the database was never findable. The two backend families had also drifted onto different `source` sentinels (`'ai-agent'` vs `'dynamic-workflow'`), and the two Redis implementations disagreed on key escaping — so at least one of them matched nothing. Rather than keep shipping plumbing for a path no caller could complete, it is removed until it can be reintroduced deliberately.

Removed:

- `getAIGeneratedWorkflows` from `WorkflowService` and `WorkflowRunService`, and from every backend (in-memory, Redis, MongoDB, Kysely, and the Cloudflare Durable Object service and client — the last two were already a `return []` stub and a rejection).
- The database-lookup fallbacks in `startWorkflow` and `runWorkflowJob` that resolved a workflow name against stored graphs when static meta had no match.
- `'dynamic-workflow'` from the `WorkflowRuntimeMeta['source']` union.
- `validateWorkflowWiring` and `computeEntryNodeIds` from `@pikku/core/workflow`. These validated AI-authored graphs and had no callers in core; the inspector keeps its own private entry-node computation for static graph wiring, which is unaffected.
- The `workflow-created` AI stream event and its AG-UI `pikku:workflow-created` custom event. Its only emitter went with the April deletion, so it could never fire.
- The console's `console:getAIWorkflows` RPC, the `useAIWorkflows` hook, the "Dynamic" workflow filter and badge, and the trigger-schema scraper that derived an input form from a stored graph's `$ref` bindings.

Kept, because static graph workflows depend on them and this is not a change to versioning:

- `upsertWorkflowVersion`, `getWorkflowVersion`, `updateWorkflowVersionStatus`, and the `workflowVersions` storage in every backend. These back version-mismatch replay: when a deployed graph's hash changes, in-flight runs continue against the exact graph they started on. No schema migration is needed — the table, its columns, and its `(workflowName, graphHash)` upsert key are unchanged.
- `generateMermaidDiagram`, which renders any workflow graph and is not specific to dynamic ones.

Static `pikkuWorkflowGraph` and DSL workflows are entirely unaffected: they resolve from codegen'd meta, which was always the only path that worked.

To revive this post-MVP, the deleted authoring code is recoverable in full — its prompt engineering (a compact tool table upfront, full schemas with flattened dotted output paths returned only after a validation failure) is worth reading before rewriting:

```
git show f52f3308b^:packages/core/src/wirings/ai-agent/agent-dynamic-workflow.ts
git show f52f3308b^:packages/core/src/wirings/workflow/graph/graph-validation.ts
git show f52f3308b --stat   # the April removal, incl. the three e2e feature files
```

Note that reviving it needs more than restoring those files: the queued-step path (`executeWorkflowStep`), `onError` compensation, and sub-workflow resolution all read static meta only and would need a fallback for a graph that exists solely in the database.
