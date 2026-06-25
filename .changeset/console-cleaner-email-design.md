---
'@pikku/console': patch
---

feat(console): cleaner email preview & editor design

Redesign the EmailsPage preview/editor:

- Replace the Popover/SegmentedControl template + mode selectors with `Select`
  dropdowns and a `PikkuSwitch` for preview mode (desktop/mobile/html/text),
  with matching i18n strings.
- Add a syntax-highlighted, theme-aware HTML source view using
  `@codemirror/lang-html` + `@codemirror/theme-one-dark`, following the app
  colour-scheme tokens.
- Add a vite resolver so generated `pikku-fetch`/`pikku-rpc` client imports
  resolve to their `.ts` sources in the console dev build.
