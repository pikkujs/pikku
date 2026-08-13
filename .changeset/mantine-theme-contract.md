---
'@pikku/mantine': patch
---

feat(mantine): publish the console colour contract as `@pikku/mantine/theme`

Two consoles draw the same product and each had its own token set. The console's
lived in a `--app-*` block inside its `ThemeProvider`; the contract that governs
those names — which role each token plays, which pairs are allowed to differ,
and a `node --test` file enforcing it — lived in a private fabric package. So
the rules existed for one of the two consoles, and the other accumulated names
with no role behind them (`--app-glass-bg`, `--app-rail-bg`, `--app-accent-bar`).

`@pikku/mantine/theme` is that contract, as a subpath export of a package both
consoles already depend on. `createCssVariablesResolver(overrides)` builds the
resolver, so an embedding app restates only the tokens it genuinely differs on
rather than a whole palette — and pikku's brand blue turned out to already BE
fabric's accent, so the console overrides nothing.

The test ships with it and is parameterised by `THEME_CONTRACT_ROOTS`, so each
consumer runs the same rules over its own tree: every `--app-*` referenced
anywhere is defined, no second name for one colour, no feature-scoped prefixes.
