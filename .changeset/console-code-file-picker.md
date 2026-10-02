---
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/code-edit': patch
---

⌘P on the Code page opens a fuzzy file picker over every file in the project, git-ignored files left out. New `console:listProjectFilePaths` RPC and `WorkspaceFilesService.paths()`.
