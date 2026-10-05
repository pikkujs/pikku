---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

addon-console lists, reads and writes a project's files (`listProjectFiles`, `listProjectFilePaths`, `readProjectFile`, `writeProjectFile`) through `@pikku/code-edit/files`, confined to the workspace, behind the `pikku:console:files` scopes.
