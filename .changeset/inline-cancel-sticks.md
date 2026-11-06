---
'@pikku/core': patch
---

Cancelling an inline workflow run now holds. The run used to keep going and write `completed` over `cancelled`; it now rereads its status, stops before its next step or retry, leaves a status `cancelRun` set in place, and finishes any compensation that was waiting on the step it was in.
