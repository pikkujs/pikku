---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku addons add amazonaws.com:applicationcostprofiler` installs an addon generated from an OpenAPI in the registry catalogue, naming it after the entry and taking `--auth` from what the registry records (OAuth is always per user). `pikku new addon <name> --openapi` takes a catalogue name too. `--registry` points either at another registry.
