---
'@pikku/cli': patch
---

Add a `startServerFnsFile` codegen option that emits a TanStack Start server-function shim.

When set in `clientFiles`, the CLI generates a typed `makeApi(): PikkuRPC` caller over the generated RPC map for use in Start loaders, actions and components. The shim reads the API base URL from `import.meta.env.VITE_API_URL` (throws if unset) and imports the `PikkuRPC` class from `rpcWiringsFile`, so the import path is always correct relative to the app. Self-skips when `startServerFnsFile` is unset and warns when `rpcWiringsFile` is missing.
