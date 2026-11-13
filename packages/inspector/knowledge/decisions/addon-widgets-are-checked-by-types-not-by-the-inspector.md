---
type: decision
title: An addon's widgets, things and arranged screens are checked by types, not by the inspector
description: definePlugin is typed against the addon's functions, message keys and a WidgetRegistry Studio fills; the inspector only reads the fields statically and checks keys, paths and literal shapes; text is always a declared message key or an explicitly marked dynamic value
tags: [inspector, screens, studio, addon, i18n]
---

# An addon's widgets, things and arranged screens are checked by types, not by the inspector

`definePlugin` takes optional `widgets`, `things` and `arrangedScreens`. What
must be true of them is split between tsc and the build.

**Types** (`DefinePlugin<Fns, Key>` in `@pikku/core/addon`, bound by the
generated `#pikku/addon/screens` to the addon's RPC map and the keys of its
`messages/en.json`):

- a slot's `widget` is one of the addon's own `widgets` or a key of
  `WidgetRegistry`, an interface `@pikku/core` leaves empty and Studio's widget
  package fills by module augmentation;
- `source` and `run` name a function of the addon, or a project RPC
  (`<namespace>:<function>`), whose output is typed as unknown;
- `from` is a key of the source's output, each `copy` words every `variant`
  the data can name, and `redirect` keys are those variants;
- every message key is a key of the catalog.

**The build** (Go and Rust inspectors, byte-identical): every field must be a
literal (PKU345, which also covers a malformed RPC name, a destructive action
without `confirm`, `lanes` outside 1-6 and a `poll` that is not a positive whole
number of ms); arranged paths share PKU357 with screens; PKU358 covers every
message key the new fields declare.

Rejected:

- **A catalogue of core widget ids in Pikku**, validated at runtime. Pikku does
  not ship the widgets; a list here would drift from Studio's and need a release
  of both to add one. The registry is Studio's to fill.
- **New runtime codes for widget ids and `from` keys.** The inspector does not
  see Studio's registry, and the output shape of a function is already what tsc
  knows. The data at `from` matching the widget's props is deferred.
- **Wording on the wire.** Sources return a `variant` and raw `values`; the
  words are message keys declared in `copy`. A source returning text (or message
  keys) would put unchecked, untranslatable strings on screens. The contract is:
  text is always a declared key or an explicitly marked dynamic value. Data
  that is not the addon's words is marked dynamic by the host before it is
  shown; Studio's widget props take `I18nString`.
- **A trust field.** Which addons may place widgets is Studio's decision and is
  deferred; nothing in the manifest claims it.

`{placeholders}` in a key are not typed against `values`: the catalog's text is
not part of the type, so the two are kept in step by hand.
