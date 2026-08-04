---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

The audit trail is now readable — in the generated meta, through an RPC, and as
a page in the console.

`audit: true` reaches `FunctionRuntimeMeta.audit` as its resolved form
(`{ durability }`), so which functions record anything is answerable without
running them. It is informational: the runner still resolves audit from the live
function config, so meta and runtime cannot disagree.

`AuditService` grows an optional read side — `query(AuditQuery)` and `facets()`.
Optional because a sink can legitimately be write-only: a queue producer that
hands events to another system has nothing to read back, and a reader that finds
these absent should say the trail is not readable here rather than that it is
empty. The two are very different answers to give someone auditing a system.

`KyselyAuditService` implements both, newest first with offset paging, filtered
by actor, action and time window. Two things it now gets right that are easy to
get wrong: an empty filter array means "match nothing" rather than "no filter",
and results are read by physical *and* camelCase key, because `CamelCasePlugin`
is on most pikku Kysely instances and renames result keys on the way out — the
mismatch does not throw, it returns a page of `undefined`. `init()` creates the
`audit` table for projects that do not migrate it themselves, from a new
exported `auditSchema` that stays out of `pikkuSchemas` because the runtime does
not need it.

The console addon exposes `console:getAudits` and `console:getAuditFilters`
behind a new `pikku:audit:read` scope, and forwards the application's `audit`
service into the addon's own services — without that last part every install
reported the trail as unreadable, whatever sink it had configured.

The console gets an Audit trail page: an infinite list filtered server-side by
actor and action, and a row that opens the whole event, metadata rendered as a
JSON tree. Refused, unreadable and empty are three different screens, because
"you may not read this", "nobody can read this" and "nothing happened" are three
different facts.
