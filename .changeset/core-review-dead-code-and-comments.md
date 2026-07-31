---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
---

Fix four latent correctness bugs in the function, RPC and error runtimes, and
remove dead code from the workflow service surface.

`WorkflowService.getNodesWithoutSteps` is gone. It was declared on the abstract
service and implemented by all five storage backends, and nothing ever called
it — hence the non-core packages in this changeset, which only lose that method.

**An RPC could execute twice.** `RPCService.invoke`, its addon path, and
`rpcWithWire` each wrapped the *execution* of a resolved function in a `try`
whose `catch` treated `RPCNotFoundError` as "not found locally" and re-dispatched
the call through `deploymentService`. A nested `rpc.invoke` to a missing name,
raised from inside an already-running function, therefore re-ran that function on
a remote instance after its local side effects had already committed. Resolution
is now separated from execution on all three paths, so only a genuinely
unresolvable name reaches the fallback. What escapes to callers is unchanged.

**`addonNamespace` leaked between sibling calls.** The function runner's
middleware path restored `rpc`, `functionId`, `audit` and `addonNamespace` after
an invocation; the non-middleware path restored the first three but not the
fourth. A call into an addon function with no middleware left the addon's
namespace on the wire, so subsequent sibling calls resolved the wrong
per-instance singletons and `credentialOverrides`.

**Errors registered on a subclass never resolved.** `misc.errors` was typed
`Map<PikkuError, ErrorDetails>` — instances — while `addError` stores
constructors, a mismatch hidden by its `error: any` parameter. The instance
lookup in `getErrorResponse` was consequently dead, and lookup fell through to a
scan comparing `constructor.name`, so a subclass of a registered error got no
status mapping at all. The map is now typed `Map<PikkuErrorConstructor, …>` and
lookup walks the prototype chain first. Name matching is retained, deliberately,
as the fallback that keeps error mapping working when two copies of
`@pikku/core` are installed.

**`createWeakUID` collided across instances.** The prefix was
`Date.now().toString(36)` evaluated at module load, so any two instances loading
the module in the same millisecond emitted identical `channelId` and `requestId`
sequences — reproducibly, not just in principle. It is now seeded lazily from
`crypto.randomUUID()`.

Also: `pikkuState` keys its global map with `Symbol.for` rather than `Symbol`, so
two copies of the package share registrations instead of silently getting
disjoint state; and the local channel upgrade path no longer keys its middleware
cache on the raw request path, which grew the cache without bound while the
cached value never varied by path.
