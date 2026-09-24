---
'@pikku/cli': patch
---

`pikku new addon --openapi` is one command: it takes a URL or path, --openapi-header, --tags/--include/--exclude and --auth user|shared|none, picks the auth mode from the spec (delegated with --auth-config), refuses a spec without machine-readable auth, writes a valid addon config with icon and forceRequiredServices, and inside an app installs the addon: dependencies, a wireAddon file with expose, Better Auth wiring and the base-URL env entry, then install and build.
