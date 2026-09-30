---
'@pikku/cli': patch
---

`#pikku/setup` exports `pikkuServerLifecycle`, typed to the project's own singleton services, so the server lifecycle shows up in `pikku doc` next to the other three bootstrap factories. An addon's setup barrel does not have it. The template and the bootstrap skill import it from there.
