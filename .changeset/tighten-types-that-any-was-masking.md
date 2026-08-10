---
'@pikku/core': patch
---

Tighten several public types that `as any` was masking

- `AIStreamEvent`'s `approval-request` variant now declares `runId: string` rather than `runId?: string`. Every emitter already set it, and `AIAgentResult['pendingApprovals']` has always required it — the optional let `undefined` reach a field consumers rely on to resume a suspended run.
- `PikkuWire` gains an optional `logger`. The no-op audit service already read `wire.logger` before falling back to the singleton, but nothing declared it, so a host had no typed way to attach an invocation-scoped logger.
- `pikkuAuth`'s marker is now the exported `AuthBranded` type instead of an untyped property, so the brand that agent tool filtering depends on is visible to the type system at both the site that sets it and the sites that read it.

Internally this takes core's non-test modules from 108 `as any` casts to none. Each is replaced by an assertion to the type actually wanted, or by a change to the surrounding types that makes the assertion unnecessary. A test holds the count at zero.
