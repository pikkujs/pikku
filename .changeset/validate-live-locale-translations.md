---
'@pikku/cli': patch
'@pikku/code-edit': patch
---

`pikku validate` now fails when a language the app serves (listed in `project.inlang/settings.json` `locales`) is missing translations: absent keys, values still marked `%i18n-missing%`, mismatched placeholders, invalid plurals or stale keys. Locales with a messages file that are not listed are drafts and are skipped. `pikku i18n check` also reports keys missing from a locale as errors and `I18nCheckReport` gains `liveLocales` and per-catalog `missing`.
