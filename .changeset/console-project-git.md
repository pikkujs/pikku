---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

addon-console reads a project's git status, diff and log and commits, pulls and pushes it (`getGitStatus`, `getGitDiff`, `getGitLog`, `commitGitChanges`, `pullGitChanges`, `pushGitChanges`) through `@pikku/code-edit/git`, behind the `pikku:console:git` scopes.
