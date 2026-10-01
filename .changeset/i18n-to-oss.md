---
'@pikku/code-edit': minor
'@pikku/addon-console': minor
'@pikku/cli': minor
'@pikku/console': minor
---

Translations move into OSS: `I18nService` in `@pikku/code-edit/i18n` manages each frontend's Paraglide catalogs, the console addon exposes it as `console:*I18n*` RPCs under `pikku:console:i18n:read|write`, `pikku i18n list|add|sync|default` drives it from the CLI, and the console gains a Translations page.
