---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

The deploy planner now binds a unit to the units of the functions its functions call with `rpc.invoke('name')` / `rpc.remote('name')`. Before, a caller and callee split into different units (e.g. a no-service function in `svc-base` calling a DB function in `svc-kysely`) got no service binding and failed on the deployed stage with "No service binding for function". The inspector records literal RPC names per function as `invokes` (single, double or substitution-free template quotes; `rpc!`, `wire.rpc`) and warns on a computed name, which the planner cannot see (#1883).
