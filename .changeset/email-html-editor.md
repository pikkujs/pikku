---
"@pikku/console": patch
"@pikku/addon-console": patch
---

feat(console): add an HTML tab to the email preview with an inline source editor

The email preview now has a Desktop | Mobile | HTML toggle. The HTML tab shows the
raw template source (`templates/<name>.html`) in a CodeMirror editor with a Save
button that writes the file back via a new `console:updateEmailTemplate` RPC
(local-dev only, mirrors `updateFunctionBody`), so small edits can be made from the
console without leaving the preview. Saving invalidates and re-renders the preview.

- `renderEmailPreview` now returns `source` (the un-rendered template HTML) so the
  editor binds to the source, never the rendered output.
