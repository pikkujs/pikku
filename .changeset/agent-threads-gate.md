---
'@pikku/cli': patch
---

Gate the generated `getAgentThreads` behind `auth: true`. It lists the caller's own threads, so an anonymous caller could only ever get an empty array back — but it was the one exposed agent function with neither a permission nor a session requirement, so every scaffolded project shipped a PKU574 warning.
