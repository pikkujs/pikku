---
'@pikku/cli': patch
---

Emit the gateway surface into `#pikku/gateway`

`wireGateway` had meta codegen but no types codegen, so the only way to wire a
gateway was to import `@pikku/core/gateway` directly. It now generates
`#pikku/gateway`, carrying a project-typed `wireGateway`, `GatewayWiring`, a
`PikkuGatewayAdapterFactory` that receives the project's own `SingletonServices`,
and the adapter/message types an implementation needs.

It gets its own barrel rather than joining the `pikku-types.gen.ts` hub, so the
generated surface does not repeat the root-barrel duplication it replaces.
