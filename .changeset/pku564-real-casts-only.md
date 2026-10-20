---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/skills': patch
---

PKU564 now fails only on a real cast around a service factory: `as`, `<T>` or a non-null assertion (`!`). `satisfies` and parentheses leave the factory's type as written, so the inspector reads through them: `pikkuConfig(...) satisfies CreateConfig<Config>` or `(pikkuWireServices(...))` registers exactly like a direct call, addon contract included. A cast with `satisfies` or parentheses between it and the call is still PKU564, and the message names the outermost cast.
