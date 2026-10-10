---
'@pikku/mantine': patch
'@pikku/react-layout-panel': patch
'@pikku/cli': patch
'create-pikku': patch
'@pikku/skills': patch
'@pikku/react': patch
'@pikku/paraglide': patch
---

`@pikku/mantine` and the `pikku-mantine` skill are removed. Theming guidance, the accessibility, i18n and RTL rules, and the blueprint rebuild values now describe Tailwind and shadcn, `pikku validate` checks the `packages/theme` contract instead of the Mantine theme package, and `create-pikku` defaults to the starter template's `app` frontend. `@pikku/react-layout-panel` is removed; its shell and dock live in the pikkujs/shadcn-registry repo as a shadcn item.
