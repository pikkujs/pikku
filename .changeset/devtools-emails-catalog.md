---
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Ready-made transactional emails (invitation, magic link, password reset, receipt, welcome) in `@pikku/code-edit/emails`, with `pikku emails catalog [name]`, `pikku emails add <name>` and the console `getEmailCatalog` / `addCatalogEmail` RPCs. `pikku emails init` now scaffolds the theme keys the templates and `applyEmailTheme` use (`canvas/surface/border/text/muted/accent/button/buttonText`) and a `common.footer` locale key.
