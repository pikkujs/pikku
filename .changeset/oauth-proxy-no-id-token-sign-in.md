---
'@pikku/better-auth': patch
---

Providers signed in through the OAuth proxy only accept redirect sign-in; ID-token sign-in is disabled for them, and a oneTap plugin that would check tokens against the proxy's client id is rejected at configuration time.
