---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/console': patch
---

Add `onError` compensation to DSL workflows.

A DSL workflow had no way to express error handling at all — `try/catch` is not
an allowed statement, and step options carried only `retries`/`retryDelay`. A
step can now name a compensation RPC:

```ts
await workflow.do(
  'Charge',
  'chargeCard',
  { id },
  {
    retries: 3,
    onError: 'refundOrder',
  }
)
```

Semantics mirror a graph node's `onError` exactly: once the step's retries are
exhausted the handler is invoked with `{ error: { message } }` and the original
error is still thrown. This is compensation, not recovery — the workflow fails
either way. The handler runs as its own durable step, so a replay cannot
compensate twice, and it does not inherit `onError` itself.

The handler is materialised as a real graph node, so it is wired like any other
RPC and the console draws a dashed red "on error" edge to it rather than the
route being invisible.
