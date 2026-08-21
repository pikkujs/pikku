---
'@pikku/react': patch
---

feat(react): `createLocaleStore` — the locale store every frontend was hand-writing

Measured across five apps, 35 of ~52 non-comment lines of `src/i18n/config.ts`
were identical, and two of the five were byte-identical. What was duplicated is
not app config but a store: the active locale, a listener set, the
`useSyncExternalStore` hook, the RTL check, a persisting setter and a
non-persisting one, and the `overwriteGetLocale` bridge that points Paraglide's
`getLocale()` at all of it.

The bridge is why this mattered. It is one line and the least obvious one, and
an app that copied the store but dropped it renders one locale while believing
in another — which is exactly what happened. Copy-paste loses the interesting
line first.

What stays in each app is what actually differs: its locale list, its storage
key, and its `detectInitialLocale` policy. `overwriteGetLocale` is injected
rather than imported, so the package takes no dependency on one app's compiled
Paraglide output.
