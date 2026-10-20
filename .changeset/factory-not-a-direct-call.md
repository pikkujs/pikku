---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/skills': patch
---

A service factory export wrapped in a cast now fails the build with `PKU564` (`FACTORY_NOT_A_DIRECT_CALL`, critical), in both inspectors. That covers `as`, `<T>`, `satisfies`, a non-null assertion and parentheses around `pikkuServices`, `pikkuAddonServices`, `pikkuWireServices`, `pikkuAddonWireServices`, `pikkuConfig`, `pikkuAddonConfig` or `pikkuServerLifecycle`. Before, the inspector skipped the factory without a word: an addon written as `pikkuAddonServices(...) as unknown as CreateSingletonServices<...>` generated no `pikku-package.gen.ts`, and its workflows failed at runtime with `WorkflowNotFoundError`. The message names the export, its file and line, and asks for the cast to be removed and the type it hid to be fixed.

Core's package factory slots (`PikkuPackageState['package']['factories']`, which every generated `pikku-package.gen.ts` assigns) are now typed `CreateConfig<any>`, `CreateSingletonServices<any, any>` and `CreateWireServices<any, any, any>`. Typed against `CoreConfig` / `CoreSingletonServices`, they refused an addon whose `Config` has required fields of its own or whose services narrow a core one, which is what pushed addons into the cast. Such an addon's factory now type-checks as written.
