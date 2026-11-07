---
'@pikku/inspector-go': patch
---

Schema generation treats `NoInfer<T>` as `T` in both inspectors instead of failing with `unknown intrinsic method: NoInfer`
