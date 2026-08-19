---
'@pikku/cli': patch
---

fix(cli): always require the framework singletons in a generated services map

`serializeServicesMap` added `config`/`logger`/`variables`/`schema`/`secrets` to
the used-services set, but built the map by iterating the project's declared
`SingletonServices`. An application's type carries those singletons, so the
marking took effect; an addon's declares only the addon's own services, so no
key was ever created for them, nothing came out required, and the emitted type
fell back to `Partial<SingletonServices>` — which does not satisfy
`CoreSecretlessSingletonServices`, so every generated file in the addon failed
to compile. The defaults are now unioned into the iterated key set, leaving
application output byte-identical.
