---
'@pikku/core': patch
'@pikku/cli': patch
---

fix(cli): let commands that seed a project run outside one

Every `pikku` invocation loaded `pikku.config.json` before the command was
dispatched — `createConfig` in the CLI's service factory called
`getPikkuCLIConfig` unconditionally. In a directory that is not a Pikku project
the upward search stops at the repo root and throws `Config file
pikku.config.json not found`, so the command never ran. That is right for
commands that read a project, and wrong for `pikku skills install`, whose entire
job is to write agent skills into a repo that has no Pikku config yet. The
command needed the thing it exists to precede.

`executeCLI` now passes the resolved command path to `createConfig`, and the CLI
treats `skills` as config-free: it still uses a project config when one is there,
so behaviour inside a project is unchanged, and falls back to an empty config
when there is none. Commands that read a project are untouched and still refuse
to run without one.

Also stops a lie in the failure path. A config that was found but could not be
loaded — a missing field tripping the resolver, malformed JSON — was reported as
`Config file not found: <path>`, naming a file that was sitting right there and
sending the reader to look for it. It now reads `Failed to load config file`.
