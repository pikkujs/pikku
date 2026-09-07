---
'@pikku/deploy-cloudflare': patch
'@pikku/deploy': patch
---

the runtime's built-in remote job inbox stands down on units that wire the inbox themselves, so `scaffold.remoteJobs` routes and their middleware actually serve dispatch
