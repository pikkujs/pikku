---
'@pikku/cli': patch
---

`pikku fabric validate` warns when an app's `baseLocale` is not `en`.

`baseLocale` names the message source, not the language the app is served in,
and pointing it at the product's language looks like it works — the app does
come up in that language. What it actually does is leave the project without an
English catalogue to add a second language from, permanently, because repointing
it later re-authors every key.

New finding `app-base-locale-not-english-<app>` (warn) says so and names the
setting that was wanted instead: `baseLocale: "en"` with the language in
`locales`, and `defaultLocale` in `active.json` deciding what a first-time
visitor opens in. Where the app is already keyed in the other language the hint
adds that this is a re-key rather than a rename, since that is the part someone
otherwise discovers halfway through.
