---
'@pikku/console': patch
---

`ShellHeader`'s offscreen width-measurement clone no longer duplicates the
search input's placeholder and value in the DOM.

The measurement layer re-renders each control to measure its natural width. For
the search `TextInput` it rendered a second element carrying the same
`placeholder`/`value`, so `getByPlaceholder(...)`-style lookups matched two
elements. The measurement clone now drops the placeholder/value (and is marked
read-only + `aria-hidden`), leaving a single interactive search field in the
accessibility tree.
