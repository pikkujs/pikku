---
'@pikku/cli': minor
---

Add `pikku fabric projects`, listing the projects in your organization with their ids. The fabric API already exposed `fabricCliProjects`; no command called it, so a project's id was reachable only through the web console — and a checkout whose `pikkufabric.config.json` still held the `__PROJECT_ID__` placeholder could run no other fabric command to recover it. `fabric init` was no help either: it only creates, so against a project that already exists it fails with a 409 carrying no id. Projects matching the local config are marked.
