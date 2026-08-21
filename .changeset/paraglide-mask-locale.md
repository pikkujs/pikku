---
'@pikku/paraglide': patch
---

feat(paraglide): the i18n-debug mask locale, generated rather than wrapped

`paraglideMaskLocale` writes a copy of the base catalog with every visible
character replaced by a block glyph, for Paraglide to compile like any other
locale. Switch to it and anything still readable on screen never went through a
message — the hardcoded string that `tsc` and the `@pikku/mantine` `I18nNode`
gate cannot see, because it sits in plain JSX, an `aria-label`, an `alt` or a
`document.title`.

Making the mask a locale rather than a runtime wrapper around the `m` namespace
is what keeps messages tree-shakeable: a wrapper touches every export. It is
also free in production — the catalogue is deleted on a build, so Paraglide
compiles the locale to aliases of the base one.

`{placeholders}` and whitespace are preserved: a placeholder is a message input,
not copy, and mangling one changes the compiled function's signature.
