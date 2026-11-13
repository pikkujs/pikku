---
'@pikku/openapi-parser': patch
---

Addons generated from an OpenAPI document now export an HTTP route contract. `generateAddonFromOpenAPI` emits `src/<name>.http.ts` with a `defineHTTPRoutes` contract (`<camelName>Routes`) that maps every operation's method and `:param` path straight to its generated function, and exports it from the addon index. The host serves the whole API with `wireHTTPRoutes({ routes: refHTTP('<namespace>:<camelName>Routes') })` and adds its own auth, middleware and permissions there. The contract is omitted under `--camel-case`, where input keys no longer match the names on the wire.

A request body that is not an object (an array, say) is now the function's `data` input rather than `body`, because that is the key Pikku's HTTP layer delivers such a body under, so the route and the function agree. The generated service also sends that value as the upstream body, where it used to send `{ "body": [...] }`. Regenerated addons with an array-body operation get the renamed input key, so callers passing `{ body: [...] }` should pass `{ data: [...] }`. An operation with a parameter already named `data` keeps `body` and is left out of the contract.

Header parameters are not part of the input Pikku builds from an HTTP request, so a generated function now reads the headers its operation declares from the request on the wire and forwards them upstream (only the declared ones; the rest of the incoming request is addressed to the host, not the upstream). The header stays an optional input field so a caller with no request, such as RPC, can still supply it, and the wire value wins when both exist. A header parameter that the spec marks required no longer makes the input field required, since over HTTP it could never arrive there.
