---
'@pikku/react': patch
---

**Breaking:** removed the react-i18next shim. The `@pikku/react/i18n` subpath export (`useI18n()`, `I18nProvider`) and the `i18next`/`react-i18next` peer dependencies are gone. `@pikku/react` now contributes only the i18n *brand* (`I18nString`, `I18nNode`, `asI18n`) from the package root; apps own their reactive locale store via a Paraglide JS scaffold (`m()` / `useLocale()`). Migrate `const { t } = useI18n()` call sites to Paraglide's `m`. The brand is structurally Paraglide's `LocalizedString`, so `m()` satisfies the `@pikku/mantine` gate natively.
