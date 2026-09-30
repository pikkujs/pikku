---
'@pikku/cli': patch
---

`pikku release` keeps scaffold and generated entries in the surface and tags them `platform: true` instead of dropping them, including wirings with no `sourceFile` whose function is platform (such as an injected queue worker). The changelog lists them under their own `### Platform` heading.
