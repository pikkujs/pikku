---
"create-pikku": patch
---

Fix create-pikku to fail on install/pikku errors and strip workspace: protocol from generated package.json. Previously npm install failures and pikku codegen failures were silently ignored, causing downstream sync-template jobs to report false success.
