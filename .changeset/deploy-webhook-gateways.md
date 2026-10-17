---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/deploy': patch
---

Deploy: `wireGateway` routes reach the deployment manifest.

A webhook gateway is now served from its handler's unit — the POST/GET wrappers, the handler they call and the services it builds — and is listed under the new `manifest.gateways` (`GatewayDefinition`). Previously the wrappers became two units of their own without the handler's services or meta, and the gateway itself appeared nowhere in the manifest.

Websocket and listener gateways have no unit a multi-unit provider can host, so `pikku deploy plan` / `apply` now fails naming each one and its route instead of building without it. Single-unit (standalone) deploys are unaffected.

The inspector filter now filters gateways — by handler function id, gateway name, tags or route — so a per-unit build only imports the gateway wirings it serves, and `tags` on `wireGateway` takes effect on `pikku all` as documented.

Breaking: `DeploymentManifest` has a required `gateways` field; code that constructs a manifest by hand has to supply it.
