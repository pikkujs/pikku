---
'@pikku/cli': patch
---

`pikku dev` accepts a Studio session. When `PIKKU_STUDIO_TOKEN` is set (32+ characters), a request carrying it in `x-pikku-studio` is signed in as the Studio with the `pikku:console` scope, so the console RPCs answer Pikku Studio instead of returning 401.
