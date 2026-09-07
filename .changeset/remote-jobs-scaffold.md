---
'@pikku/cli': patch
---

Add a `scaffold.remoteJobs` flag that generates HTTP routes an external dispatcher posts to, so a runtime holding neither a queue consumer nor a clock still runs its queue workers and scheduled tasks.
