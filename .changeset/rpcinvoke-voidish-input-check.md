---
'@pikku/cli': patch
---

Fix generated `RPCInvoke` and `RPCRemote` typing to use stricter void-input detection.

The generated helpers now treat only true voidish inputs (`void | null | undefined`) as omittable and avoid misclassifying `any` inputs as voidish, so non-void RPCs keep a required `data` argument.
