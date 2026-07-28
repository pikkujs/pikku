---
'@pikku/core': patch
'@pikku/playwright': patch
---

Give browser scenario steps a shared way to name an element: `browser.locate(selector)`. `TestIdSelector` (test id, `prefix`, `where` data attributes, `containing` text, `within` scope) is declared in core so a step's input stays structural, and `@pikku/playwright` resolves it against the page — applying `:visible` by default, since Mantine layouts routinely mount a hidden copy of a control.
