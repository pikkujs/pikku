---
type: decision
title: An app opens in the locale active.json names, falling back to the base locale
description: createAppI18n builds the locale store with the default locale from active.json as the initial locale, instead of detecting the browser language, and falls back to Paraglide's base locale when that locale was never compiled
tags: react, i18n, paraglide
---

# An app opens in the locale active.json names, falling back to the base locale

`createAppI18n({ messages, runtime, active })` in `locale-store.ts` wires Paraglide's compiled
messages and runtime to a locale store. Its initial locale is `active.defaultLocale` (from the
app's `src/i18n/active.json`, which `pikku i18n` edits), not the browser's language: the store is
built with `detectInitialLocale: ({ defaultLocale }) => defaultLocale`. A default that is not in
the runtime's `locales` falls back to `baseLocale`. A persisted choice still wins, as in
`createLocaleStore`.

With `I18N_DEBUG=1` or `?i18n-debug` every message is masked to block glyphs by `brandMessages`,
which also brands each string as `I18nString` for the lint gate.

**What this rules out:** an app copying the locale wiring and a reader of the first render seeing
a language the team never chose as the default.
