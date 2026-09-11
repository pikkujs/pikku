---
'@pikku/better-auth': patch
---

Dev quick login now grants `pikku:console` alongside `admin`, so the dev admin can actually open the console. The two are separate scope trees, and the console's gate checks the one quick login was not granting.
