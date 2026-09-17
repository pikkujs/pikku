---
'@pikku/modelcontextprotocol': patch
'@pikku/core': patch
'@pikku/better-auth': patch
---

An MCP tool reads the claims its host verified

`PikkuHTTP` gains an `authInfo` of the new `PikkuHTTPAuthInfo`: the token,
client and scopes a transport that already verified a bearer token hands on.
It is strictly pass-through — nothing in pikku derives it from a request's own
headers, because verifying a token is the host's job. A function could always
read the `Authorization` header itself; what this adds is what the raw header
cannot carry.

`PikkuMCPServer`'s server factory now carries the SDK's `authInfo` onto the
wire beside the request, so the `authInfo` a host passes to
`createFetchHandler` reaches the tool rather than stopping at the SDK.

`pikkuCredentialOAuth` also names itself when it provisions the platform user.
Every other pikku plugin passes a source to `internalAdapter.createUser`, and
better-auth refuses a `user.validateUserInfo` gate that is handed none — so an
app with that hook configured could not link a singleton credential at all.
