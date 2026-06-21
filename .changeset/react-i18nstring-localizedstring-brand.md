---
'@pikku/react': patch
---

`I18nString` is now branded with the string literal `'LocalizedString'` (`string & { readonly __brand: 'LocalizedString' }`) instead of an internal `unique symbol`. This makes it **structurally identical to Paraglide JS's `LocalizedString`**, so a Paraglide `m()` message satisfies the brand — and the `@pikku/mantine` i18n gate — natively, with no wrapper and with full per-message tree-shaking. Backward compatible: `asI18n()` / `t()` still produce `I18nString`, and bare `string` is still rejected by the gate (it has no `__brand`). A new type-level test in `@pikku/mantine` pins the brand literal so a future Paraglide rename fails loudly.
