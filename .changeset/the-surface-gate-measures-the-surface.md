---
'@pikku/core': patch
'@pikku/cli': patch
---

the surface gate measures the surface it actually ships

The doc-quality gate went in with ceilings of 112, 823 and 10 beside a surface
that measured 160, 1210 and 15, so it never passed on any build. Re-baselined to
the real measurements, and the key-documentation floor earned its way from 76%
to 79% by documenting what a caller has to put in `defineSecret`, the gateway
message shapes, and the scorer and judge configs.
