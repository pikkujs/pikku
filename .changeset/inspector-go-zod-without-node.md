---
'@pikku/inspector-go': patch
---

The native inspector converts Zod schemas to JSON Schema without Node: `pikku-inspect` bundles the modules that declare them with the project's own zod and runs the conversion in an embedded QuickJS. A schema built from a value imported from a package, or declared in a module that only loads under Node, is converted by Node when it is on the PATH and is otherwise an error naming the package. `pikku-inspect` is also found beside a compiled `pikku`, and the Homebrew cask installs it there. `PIKKU_INSPECTOR_ZOD=node` sends every schema to Node.
