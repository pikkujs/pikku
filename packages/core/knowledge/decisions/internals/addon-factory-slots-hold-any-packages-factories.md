---
type: decision
title: The package factory slots hold any package's factories, typed loosely
description: PikkuPackageState's package.factories types createConfig, createSingletonServices and createWireServices with any, because one registry holds every addon's factories and each addon declares its own Config and services
tags: core, addon, services, factories, types
---

# The package factory slots hold any package's factories, typed loosely

`PikkuPackageState['package']['factories']` (`packages/core/src/types/state.types.ts`) types its slots as `CreateConfig<any>`, `CreateSingletonServices<any, any>` and `CreateWireServices<any, any, any>`. The generated `pikku-package.gen.ts` of every addon assigns its factories there, through `pikkuState(packageName, 'package', 'factories', { ... })`.

**Why not the core types.** One registry holds every package's factories, and each addon declares its own `Config` and `SingletonServices`: a `Config` with required fields of its own, a core service narrowed to the type the addon expects. A factory's parameters are contravariant, so `(config: AddonConfig, existing?: Partial<AddonSingletonServices>) => ...` is not assignable to `CreateSingletonServices<CoreConfig, CoreSingletonServices>`. Typed that way, the generated file failed to type-check, and addons cast their factory export (`as unknown as CreateSingletonServices<CoreConfig, CoreSingletonServices>`). That cast hid the factory from the inspector, so it was never registered and the addon's workflows failed at runtime with `WorkflowNotFoundError`. The inspector now refuses that cast as `PKU564`, so the slot must accept the factory as written.

Each factory is still checked against its own types where it is defined, by `pikkuAddonServices` / `pikkuAddonConfig` / `pikkuAddonWireServices`. The runtime only calls it with the parent's config and services, which it never typed against the addon's own declarations anyway.

The case is pinned by `verifiers/addon-registry`: its source addon's `Config` has a required field and its services narrow `featureFlags`, and `tsc --noEmit` runs over the generated `pikku-package.gen.ts`.

**What this rules out:** typing the slot against `CoreConfig` / `CoreSingletonServices` again, which would put addons back to casting their factory.
