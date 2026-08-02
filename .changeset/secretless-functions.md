---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
'@pikku/skills': patch
---

Confine `SecretService` to the places an app is wired.

`secrets` is now omitted from the services every function, AI agent, workflow,
permission and wire receives, and the function runner replaces it with a
throwing accessor so a cast cannot reach past the type. It stays available in
`pikkuServices`, `pikkuWireServices`, addon service factories and middleware —
read a secret there, give it to a service, and have the function ask that
service.

Alongside it:

- `wireSecret` gains `allowedHosts`, refusing a secret attached to a host it was
  not declared for. Permissive by default; strict via
  `config.secrets.requireAllowedHosts`.
- `pikku-graph`'s `httpRequest` resolves and attaches its credential inside a new
  `httpRequester` service instead of holding the plaintext in the function.
- New inspector diagnostics: `PKU950` (a `SecretService` exposed under another
  service name), `PKU951` (a secret read that no `wireSecret` declares) and
  `PKU952` (a secret read with a non-literal key).
