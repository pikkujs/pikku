---
type: decision
title: The advertised resource URL comes from the forwarded origin
description: Behind a TLS-terminating proxy the server sees a plaintext request, and advertising that internal origin makes a client refuse the resource as a different one
tags: [mcp, oauth, proxy]
---

# The advertised resource URL comes from the forwarded origin

`resourceUrl` builds the MCP endpoint's public URL from `X-Forwarded-Proto` and
`X-Forwarded-Host`, falling back to the request's own origin only when neither
is set.

Behind a TLS-terminating reverse proxy the server sees a plaintext request, so
`request.url` carries the internal `http://host:port` and not the origin the
client actually used. That origin is advertised in two places a client compares
byte-for-byte: the `resource` field of the protected-resource metadata, and the
`resource_metadata` parameter of the `WWW-Authenticate` challenge. A client that
reached us over HTTPS and is told the resource lives at an `http://` URL does not
treat it as the same resource, and discovery stops there.

Each header is read as a comma-separated list and only the first entry is used,
because a chain of proxies appends rather than replaces, and the first entry is
the one describing the client.

**What this rules out:** trusting `request.url` when a forwarded header is
present. It also rules out reading the last entry of the chain, which is the
nearest proxy's view of its own peer — correct for logging, wrong for anything
the client has to match against what it typed.
