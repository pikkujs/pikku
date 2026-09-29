---
'@pikku/cli': patch
---

Workflow orchestrator units (`wf-*`) take `deploy.defaultTarget` instead of always being `serverless`. A project with `defaultTarget: 'server'` no longer gets a Cloudflare worker bundle per workflow, which failed for any workflow whose services need Node built-ins.
