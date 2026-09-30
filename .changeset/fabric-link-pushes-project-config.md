---
'@pikku/cli': patch
---

`pikkufabric.config.json` is no longer needed. A checkout is linked to its Fabric project by its git remote: every command asks Fabric for your organization's projects and picks the one whose repo is one of the checkout's remotes (`origin` first), so a fresh clone is linked without running anything. `FABRIC_PROJECT_ID` overrides it, and two projects on one repo are refused rather than guessed between. A repo that still has the file keeps working, and `pikku fabric validate` reports it as unneeded.

`pikku fabric link` and `pikku fabric init` no longer write the file, and `link` no longer commits or pushes anything on your behalf; it refuses a repo that is already a project's remote. The api url you last logged in against is remembered in `~/.fabric/auth.json`, so a `login --api-url` against a local or staging fabric sticks without a project file.

New: `pikku fabric config` shows what the checkout resolves to and where each answer came from — the project (id, name, repo, production branch), the api url, and the frontends from `pikku.config.json`.
