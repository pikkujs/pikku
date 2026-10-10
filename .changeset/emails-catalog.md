---
'@pikku/cli': patch
---

`pikku emails catalog [name]` lists the ready-made emails (invitation, magic link, password reset, receipt, welcome) and `pikku emails add <name>` copies one into the project. `pikku emails init` now scaffolds the theme keys the templates and `applyEmailTheme` use (`canvas/surface/border/text/muted/accent/button/buttonText`) and a `common.footer` locale key.
