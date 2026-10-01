---
'@pikku/code-edit': minor
'@pikku/addon-console': minor
---

Project files and local git move into OSS: `WorkspaceFilesService` in `@pikku/code-edit/files` lists and reads files confined to the workspace root, `GitService` in `@pikku/code-edit/git` gives status, log, diff, a path-scoped commit, a fast-forward-only pull and a push over the user's own git credentials, all with bounded output and timeouts. The console addon exposes them as `console:listProjectFiles`, `readProjectFile`, `getGitStatus`, `getGitLog`, `getGitDiff`, `commitGitChanges`, `pullGitChanges` and `pushGitChanges` under `pikku:console:files:read` and `pikku:console:git:read|write|sync`, local development only.
