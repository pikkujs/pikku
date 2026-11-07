---
'@pikku/inspector-go': patch
---

The Rust inspector records `auth` and `expose` on workflows, treats a workflow as session-requiring unless it declares `auth: false`, and refuses a `workflow.approval()` with no `approvers` (PKU645), the way the Go inspector does, so the two agree on every project
