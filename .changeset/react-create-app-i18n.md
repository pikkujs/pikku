---
'@pikku/react': patch
---

Adds `createAppI18n`, which turns Paraglide's compiled messages and runtime plus the app's `active.json` into the locale store, `useLocale`, `setActiveLocale`, `localeDir` and branded `m` an app used to assemble by hand. The app opens in the default locale `active.json` names, falling back to the base locale; `I18N_DEBUG` still masks every message. `brandMessages` is exported for apps that build their own.
