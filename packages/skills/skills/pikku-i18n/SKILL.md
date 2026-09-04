---
name: pikku-i18n
description: >-
  Use when writing user-facing text in a Pikku frontend, or making one speak another language.
  Covers Paraglide JS message functions compiled from messages/<locale>.json, adding a second
  language, generated enum-label maps with @pikku/paraglide, and right-to-left support for Arabic,
  Hebrew, Farsi and Urdu. TRIGGER when: scaffolding or editing a frontend and writing display
  text, asked to make copy translatable, adding a language, labelling an enum/status/role value,
  or asked to support RTL / mirror the layout. DO NOT TRIGGER for backend functions, error
  messages thrown from functions, or log output — none of those are display strings.
installGroups: [client]
---

# Pikku i18n

## Every visible string is a message

Never hardcode display text: add a key to `messages/en.json` and render
`m.the__key()`. This holds even in an app that will only ever ship English —
the messages are the seam a second language slots into, and the deploy pipeline
type-checks them, so an i18n mistake blocks the build rather than the release.

## Pick the reference

| You are… | Read |
| --- | --- |
| Writing copy, wiring Paraglide, or adding a language | `references/messages.md` |
| Labelling an enum, status, kind or role value | `references/enum-labels.md` |
| Adding Arabic (or Hebrew, Farsi, Urdu), or writing layout styles | `references/rtl.md` |

## Three axes, and a brief usually means only one

"The entire UI is German" is a statement about the product, not about the
codebase. Reading it as one about the codebase is the most expensive mistake
available here.

| Axis | What it covers | What sets it |
| --- | --- | --- |
| **Identifiers** | Function, component, type and file names; tables and columns | Nothing — always English |
| **Meta** | `description` / `name` / `title` authored in code, rendered by the console | `metaLocale` in `pikku.config.json` |
| **Product UI** | Every string the app shows a user | `messages/<locale>.json` + `defaultLocale` |

`baseLocale` stays `en` whatever language the product speaks — it names the
message *source* catalogue every other locale is derived from, not the language
the app is in. Set `defaultLocale` instead.

## Direction is one setting, not per-component work

Set `dir` once at the document root from the active locale and the browser (and
Mantine) mirror everything — provided every custom style is flow-relative
(`margin-inline-start`, `text-align: start`, Mantine `ms`/`me`) rather than
physical (`margin-left`, `text-align: left`, `ml`/`me`'s physical twins). Write
logical properties from the start even in an English-only app; that discipline
is what makes an RTL language just another locale file.

## What NOT to do

- **Do not resolve a message key at runtime.** No `mKey('status.' + value)`, no
  `m['enum__' + x]()`, no key-string resolver. A computed key cannot be
  type-checked or tree-shaken, so a renamed message degrades to silent runtime
  text. Where the key is genuinely dynamic, map the discriminant to a message
  *function* — the map is checked, a string is not.
- **Do not `asI18n()` a hardcoded English string.** `asI18n` exists to pass
  opaque server data (a name, a slug, an id) through the i18n gate. An enum value
  goes through its generated label map.
- **Do not wrap `m` without a reason you can name.** `m.some__key()` already
  satisfies the `I18nNode` gate, so a plain re-export module adds nothing and
  costs per-message tree-shaking. Wrapping the namespace is only worth it when it
  buys a feature the gate cannot — debug masking of translated copy, say — and
  then the catalogue has to be small enough to ship whole.
- **Do not translate message keys.** `auth__login__title` stays English in
  `de.json`; only the value changes.
- **Do not edit or commit `src/paraglide/`, `i18n-enum.gen.ts` or `enums.gen.ts`.**
  Change the catalogue or the migration and regenerate.
- **Do not fake RTL** with `flex-direction: row-reverse`, reversed DOM order, or
  per-locale layout branches. They double-flip the moment direction changes. DOM
  order is logical order; let `dir` decide the visual one.
- **Do not reach for i18next or a runtime translation loader.** Paraglide's
  compiled functions are the whole delivery mechanism.
