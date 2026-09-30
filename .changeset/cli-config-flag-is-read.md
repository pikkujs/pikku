---
'@pikku/cli': patch
---

`pikku <command> --config <path>` (and `-c`) now reads the config it names. The flag was declared as `config` while the loader read `configFile`, so it was dropped and the CLI searched upward from the current directory instead. Relative fields in the config resolve against the config file's own directory.
