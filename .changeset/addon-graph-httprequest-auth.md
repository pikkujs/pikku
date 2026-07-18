---
'@pikku/addon-graph': patch
---

`graph:httpRequest` gains an optional `auth` descriptor. When present, the
function resolves the credential from the `SecretService` at request time and
injects it — `bearer`, `apiKeyHeader`, `apiKeyQuery`, or `basic` (`oauth2` is a
guarded not-yet-supported error). The descriptor carries only names and static
constants, never the secret value, so it is safe to serialize into a workflow
graph's declarative input (which is persisted to step state). No-auth requests
are unchanged.
