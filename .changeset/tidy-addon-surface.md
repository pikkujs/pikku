---
'@pikku/cli': patch
---

Keep wiring out of an addon's `#pikku` surface

The leaf barrel is a blanket `export *`, so every `wire*` a generator emitted
became importable from an addon — where it cannot reach the host's registry and
so could only fail. An addon build now emits the `define*` / `pikku*Func` half
only, the way `#pikku/cli` already disappeared for addons: `wireHTTP`,
`wireHTTPRoutes`, `wireChannel`, `wireQueueWorker`, `wireScheduler`,
`wireTrigger`, `wireTriggerSource`, `wireMCPResource`, `wireMCPPrompt`,
`wireGateway`, `wireAddon` and `wireRemoteAddon`.

`VARIABLES_META` and `SECRETS_META` are gone from `#pikku/variables` and
`#pikku/secrets`. They existed only to keep the metadata sidecar import from
being elided, and nothing imported them — a host reads the sidecar off disk. A
side-effect import now anchors the .json instead.
