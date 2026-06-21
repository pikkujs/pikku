---
'@pikku/console': patch
---

Fix the email HTML tab overflowing its parent: CodeMirror had no width constraint, so long lines sized the editor to content and grew the preview panel past its container. Set CodeMirror `width="100%"` and add `minWidth: 0` down the flex chain so the editor scrolls internally instead of widening the layout.
