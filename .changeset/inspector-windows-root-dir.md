---
'@pikku/inspector': patch
---

The inspector finds a project's source on Windows: its root directory is compared with TypeScript's forward-slash file names, not the backslash path `path.resolve` returns.
