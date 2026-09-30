---
'@pikku/cli': patch
---

A Fabric project is named by an optional `projectId` in `pikku.config.json`. Without one, the CLI finds the project from the git remote — it asks Fabric for your organization's projects and picks the one whose repo is one of the checkout's remotes (`origin` first) — and writes the id into `pikku.config.json`. The write is never committed or pushed, and `pikku fabric deploy` ignores a `pikku.config.json` whose only change is `projectId`. `FABRIC_PROJECT_ID` overrides both. Two projects on one repo are refused rather than guessed between.

`pikku fabric link` writes `projectId` the same way and no longer commits or pushes anything on your behalf; it refuses a checkout that already names a project. This fixes the first deploy of a linked project failing on a config file that was never pushed. The separate Fabric config file is gone, and its `apiUrl` and `production.domain` settings with it: the api url you last logged in against is remembered in `~/.fabric/auth.json`, and custom domains are managed with `pikku fabric domains`.

New: `pikku fabric config` shows what the checkout resolves to and where each answer came from — the project (id, name, repo, production branch), the api url, and the frontends from `pikku.config.json`.
