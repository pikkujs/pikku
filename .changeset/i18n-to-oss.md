---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Translations move into OSS: `I18nService` in `@pikku/code-edit/i18n` manages each frontend's Paraglide catalogs, the console addon exposes it as `console:*I18n*` RPCs under `pikku:console:i18n:read|write`, `pikku i18n list|add|sync|default` drives it from the CLI, and the console gains a Translations page.
