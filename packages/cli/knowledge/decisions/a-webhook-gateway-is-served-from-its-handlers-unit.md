---
type: decision
title: A webhook gateway is served from its handler's unit, and other gateway types fail a multi-unit deploy
description: The deploy analyzer folds a webhook gateway's POST/GET wrappers into the unit of the function the gateway runs and lists it in manifest.gateways; websocket and listener gateways are reported by unservedGateways and fail the build
tags: cli, deploy, gateway
---

# A webhook gateway is served from its handler's unit, and other gateway types fail a multi-unit deploy

The inspector projects a webhook gateway's `gateway__<name>__post` and
`__verify` wrappers into `http.meta`, so before #1906 the analyzer made each
wrapper a unit of its own: no handler, none of its services, and no gateway in
the manifest. Step 4b of `analyzeDeployment` now puts the wrappers in
`unitFor(handler)`, with the handler's services and target, and records a
`GatewayDefinition` in `manifest.gateways`.

A websocket gateway rides a channel the provider would have to host and a
listener opens its connection from a long-lived process; neither has a route a
unit can serve. `unservedGateways` names them and the build fails, the way
`unroutedHttpWirings` does for HTTP routes. Single-unit (standalone) builds skip
the check, since they run the whole app.

The inspector filter keeps a gateway by its handler id or its name, so a unit's
`--names` (its function ids) is enough to keep the wiring it serves and drop
the others.

**What this rules out:** silently deploying a gateway route that 404s, and a
`gateway` unit role every provider would have to learn.
