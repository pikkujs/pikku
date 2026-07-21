---
'@pikku/console': patch
---

Soften and tighten the dev console chrome.

- Borders give way to flat fills: every `*-border` theme token (dark + light) and
  the Badge border go transparent, so the pervasive hairline rules disappear
  without restructuring any layout. The hardcoded borders the token sweep
  couldn't reach are neutralised too — the coloured tag borders in
  Schedulers/Triggers/Channel tabs, the run-selector outline, and the database
  result-table rules. Functional/diagram borders stay (flow-node rings, the
  active tab underline, the overlapping-avatar separators).
- `ShellHeader` grows from 45px to 50px and loses its bottom rule.
- The agents and workflow playgrounds can collapse their list and detail panes.
  Each pane's collapse control lives on the pane's own outer edge, inside a row
  it already has, so nothing gains a header row just to hold an icon; a collapsed
  pane leaves a labelled rail rather than an unexplained void.
- The sidebar shows one section at a time, anchored to the current route: the
  section owning the page is the expanded one and carries the accent, so the rail
  answers "where am I" without the user keeping it tidy.
- 80+ `en.json` entries shipped with their key path as the value ("Empty title",
  "State how it works", "Header separator" between breadcrumbs). They now have
  real copy.
