---
name: pikku-i18n
description: >-
  User-facing text in a Pikku frontend: Paraglide messages, translatable copy, adding a language, enum/status/role labels, RTL (Arabic, Hebrew, Farsi, Urdu). Not backend error messages or logs.
installGroups: [client]
---

# Pikku i18n

## Every visible string is a message

Never hardcode display text: add a key to `messages/en.json` and render `m.the__key()`, even in an English-only app. The messages are the seam a second language slots into, and the deploy pipeline type-checks them, so an i18n mistake blocks the build rather than the release.

## Pick the reference

- Writing copy, wiring Paraglide, or adding a language: `references/messages.md`
- Labelling an enum, status, kind or role value: `references/enum-labels.md`
- Adding Arabic (or Hebrew, Farsi, Urdu), or writing layout styles: `references/rtl.md`

## Three axes, and a brief usually means only one

"The entire UI is German" is about the product, not the codebase. Reading it as about the codebase is the most expensive mistake here.

- **Identifiers** (function, component, type and file names; tables and columns): always English, nothing changes that.
- **Meta** (`description` / `name` / `title` authored in code, read back to the team): set by `metaLocale` in `pikku.config.json`.
- **Product UI** (every string the app shows a user): set by `messages/<locale>.json` + `defaultLocale`.

`baseLocale` stays `en` whatever language the product speaks: it names the message _source_ catalogue every other locale derives from. Set `defaultLocale` instead.

## Direction is one setting, not per-component work

Set `dir` once at the document root from the active locale and the browser mirrors everything, provided every custom style is flow-relative (`margin-inline-start`, `text-align: start`, Tailwind `ms-*`/`me-*`), not physical (`margin-left`, `text-align: left`, `ml-*`/`mr-*`). Write logical properties from the start, even in an English-only app.

## What NOT to do

- **Do not resolve a message key at runtime.** No `mKey('status.' + value)`, no `m['enum__' + x]()`, no key-string resolver. A computed key cannot be type-checked or tree-shaken, so a renamed message degrades to silent runtime text. Where the key is genuinely dynamic, map the discriminant to a message _function_.
- **Do not `asI18n()` a hardcoded English string.** `asI18n` passes opaque server data (a name, a slug, an id) through the i18n gate. An enum value goes through its generated label map.
- **Do not wrap `m` without a reason you can name.** `m.some__key()` already satisfies the `I18nNode` gate, so a plain re-export module costs per-message tree-shaking for nothing. Wrapping is only worth it for a feature the gate cannot give (debug masking of translated copy, say), and the catalogue must be small enough to ship whole.
- **Do not translate message keys.** `auth__login__title` stays English in `de.json`; only the value changes.
- **Do not edit or commit `src/paraglide/`, `i18n-enum.gen.ts` or `enums.gen.ts`.** Change the catalogue or the migration and regenerate.
- **Do not fake RTL** with `flex-direction: row-reverse`, reversed DOM order, or per-locale layout branches. They double-flip when direction changes. DOM order is logical order; let `dir` decide the visual one.
- **Do not reach for i18next or a runtime translation loader.** Paraglide's compiled functions are the whole delivery mechanism.
