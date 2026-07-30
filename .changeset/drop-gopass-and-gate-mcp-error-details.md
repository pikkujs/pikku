---
'@pikku/core': patch
---

Security hardening: removed the gopass secret service and stopped MCP internal errors leaking stack traces.

**Breaking:** `GopassSecretService` and the `@pikku/core/services/gopass-secrets` subpath export are gone. The service shelled out to the `gopass` binary and its key validation accepted `../`, so a caller-supplied key could traverse out of the configured prefix namespace and read secrets outside it. Rather than harden a shell-out that few projects used, the service is removed. Anyone importing it should implement `SecretService` against their own secret backend. Pre-0.13 breaking changes still ship as a patch.

MCP internal errors (JSON-RPC `-32603`) previously always attached `data: { message, stack }`, handing any MCP client an internal stack trace. That payload is now gated on `exposeErrors`, which defaults to `!isProduction()` — the same convention `handleHTTPError` already uses. In production a client receives a bare `Internal error` with no `message` and no `stack`; `RunMCPEndpointParams` accepts an explicit `exposeErrors` to override the default.
