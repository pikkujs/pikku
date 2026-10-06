---
'@pikku/code-edit': minor
'@pikku/addon-console': minor
---

`@pikku/shadcdn` is gone. Components install straight from the upstream shadcn registry (an existing file in the app is still never overwritten), and `installComponents` no longer reports an `ungated` list: upstream text props take plain strings, so the literal-string check in `pikku validate` is what fails the build until they come from messages. `ShadcnCatalog.componentMeta` reads a component's `cva` variants with a parser that now lives in code-edit. The console's `listBlocks` and `getBlock` functions and the block library behind them are removed, along with `addMessages` and the `blocks()` accessor.
