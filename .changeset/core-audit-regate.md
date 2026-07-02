---
'@pikku/core': patch
---

fix audit writes silently dropped on the exposed-RPC path: the auditLog wire service was created once per transport invocation (on the outer wire, e.g. the generated rpcCaller with no audit config), so audited functions invoked via nested rpc inherited a disabled instance. The runner now re-gates auditLog per audited function, binding a fresh invocation audit to the function's own wire (correct functionId/actor attribution) and flushing it when the invocation ends. Dropped-write warnings now fall back to the singleton logger (wires rarely carry one) and name the function, so a dropped audit write is never invisible.
