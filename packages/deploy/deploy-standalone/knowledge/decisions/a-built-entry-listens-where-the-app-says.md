---
type: decision
title: A built entry listens where the app says
description: HOST, then the hostname createConfig returns, then 0.0.0.0, in the standalone, server and container entries
tags: [security, network, entry, hostname]
---

# A built entry listens where the app says

The generated entries resolve the listen address as `HOST`, then
`config.hostname`, then `0.0.0.0`. This covers the standalone entry, the CLI's
server entry and the Cloudflare container entry, and the resolution runs after
`createConfig`.

An app that sets `hostname` to a loopback or private address is restricting who
can reach it. An entry that substitutes `0.0.0.0` whenever `HOST` is unset
publishes that app on every interface, with no error to show it.

`HOST` stays first because the operator, not the build, knows the network the
process runs in. The desktop shell relies on this to hold its sidecar to
loopback. `0.0.0.0` stays last so that an app naming no address is reachable
from outside its container.

**What this rules out:** treating a loopback `hostname` as a development-only
value and widening it in a built entry. Such an app needs `HOST=0.0.0.0` to be
reachable from outside its container. The `.env.example` in the standalone
output sets `HOST=0.0.0.0`, so an environment copied from it takes precedence
over the configured address.
