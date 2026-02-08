# Workflow Run History Across Deployments — Architecture Research

## Context

I'm building a TypeScript workflow framework (Pikku) that supports:

- **Two workflow definition styles**: code-based DSL (`workflow.do('stepName', 'rpcName', data)`) and graph-based (visual editor, data-driven)
- **Deterministic replay**: completed steps are loaded from DB and skipped, pending steps execute
- **Step-level state tracking**: each step has status, result, error, retry count, and timestamp history stored in PostgreSQL
- **Queue-based execution**: workflows can run inline or via job queues (pg-boss / BullMQ)
- **Single-server deployments**: most users deploy one server instance, push new code, old process dies, new one starts (no Kubernetes, no rainbow deploys)

## The Problem

When a user deploys new code while workflow runs are mid-flight:

- Steps already completed are fine (results in DB, skipped on replay)
- But if the workflow definition changed (steps reordered, renamed, removed, or new steps inserted), replay breaks — the step sequence in the DB no longer matches the code

## What I've Learned So Far

### n8n's approach

- Stores a **full workflow definition snapshot** with each execution
- Execution history only shows runs for the **current** workflow version
- Workflow version history is a separate feature
- Users can copy data from old executions into the current editor for debugging
- Effectively **sidesteps** the version mismatch problem rather than solving it

### Temporal's approach

- **Event sourcing**: immutable append-only event log per execution, replayed deterministically
- **Patching API**: `workflow.patched('changeId')` writes a marker event to history; on replay, checks for the marker to decide which code path (old vs new) to follow. Requires maintaining dead code branches until old runs drain.
- **Worker Versioning (Build IDs)**: workers declare a version; workflows are pinned to the version that started them; task queue routing ensures only matching workers pick up tasks. Old workers stay alive to drain old runs.
- Worker Versioning **requires multiple concurrent worker processes**, which assumes Kubernetes-style infrastructure

### The gap

Temporal's Worker Versioning is the cleanest solution but requires running multiple server versions simultaneously. For single-server deployments (the common case for my framework), the old code is gone after deploy.

## My Current Thinking

**Hybrid approach: snapshot orchestration, use live execution**

1. **Snapshot the workflow definition** (step graph: names, order, RPC mappings, control flow) with each run at creation time
2. **On replay, execute against the stored snapshot** — the orchestration (which steps, in what order) comes from the snapshot; the RPC implementations come from the current deployment
3. **If an RPC no longer exists or has incompatible schema**, mark the run as `stalled`/`version_mismatch` and surface it for user intervention
4. **Graph-based workflows** get this nearly for free (already data-driven/serializable)
5. **DSL workflows** need their step graph extracted and stored at creation time

This gives "pinned to a version" semantics without needing multiple running servers — the "version" is the stored orchestration graph, not a running process.

## Questions I'm Researching

1. **Are there other frameworks or systems** that solve workflow versioning for single-server / single-process deployments? How do they handle mid-flight runs after a deploy?

2. **Step identification**: What's the best way to identify steps across versions? By name? By position? By content hash? Temporal uses sequential event IDs; n8n uses node IDs. What are the tradeoffs?

3. **Schema compatibility**: When the stored orchestration calls an RPC that still exists but has a changed input/output schema, what's the best way to detect and handle this? Store schema hashes with the snapshot? Use runtime validation?

4. **Retention and pruning**: What retention strategies work best for workflow run history? n8n uses two-phase soft/hard delete with annotation-based exemptions. Temporal uses per-namespace retention + archival to S3. What's the right balance for a lightweight framework?

5. **Separation of concerns**: Should the "list of runs" and "run detail data" be in separate tables (n8n's approach for performance)? At what scale does this matter?

6. **Custom metadata / search**: n8n allows 10 key-value pairs per execution for business-context filtering. Temporal has typed Search Attributes with an Elasticsearch-backed visibility store. What's a pragmatic middle ground?

7. **The snapshot trade-off**: Storing a full workflow definition per run is simple but duplicates data. Storing a version hash and keeping a version table is normalized but adds complexity. Which approach scales better and is easier to reason about?

8. **Graceful degradation**: When a version mismatch is detected mid-run, what's the best UX? Options: auto-cancel, stall and notify, attempt best-effort continuation, let user choose per-run. What do other systems do?

9. **Graph-based vs code-based asymmetry**: Graph workflows are data (easy to snapshot/version). Code workflows are functions (hard to serialize). Is it acceptable to have different versioning guarantees for each? Or should the framework enforce a common model?

10. **Event sourcing vs state snapshots**: Temporal's event log gives you full audit trail and time-travel debugging for free, but requires deterministic replay. Pikku currently stores step-level state (closer to n8n). Is migrating to event sourcing worth the complexity for a lightweight framework, or is step-level state + workflow snapshots sufficient?
