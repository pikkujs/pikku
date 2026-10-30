---
type: decision
title: A service factory must be a direct call, and a cast around one fails the build
description: A factory export whose pikkuServices, pikkuAddonServices, pikkuWireServices, pikkuAddonWireServices, pikkuConfig, pikkuAddonConfig or pikkuServerLifecycle call sits inside a cast (as, a <T> cast or a non-null assertion) is critical PKU564, rather than being seen through; satisfies and parentheses are read through
tags: inspector, inspector-go, services, addon, factories, diagnostics
---

# A service factory must be a direct call, and a cast around one fails the build

`addFileWithFactory` (`packages/inspector/src/add/add-file-with-factory.ts`, and `group_setup_core.go` in the Go inspector) registers a factory from the call a variable is bound to. `checkHiddenFactory`, next to it, reports a variable whose initializer is one of the factory calls under a cast (`as`, `<T>` or `!`), at any depth, as `PKU564 FACTORY_NOT_A_DIRECT_CALL` at `critical`. The message names the export, its file and line relative to the root, the wrapper call and the outermost cast.

**Why `satisfies` and parentheses are read through.** Neither changes the type of the value: `satisfies` checks the factory against a type and leaves its own type as written, and parentheses do nothing. So `addFileWithFactory` unwraps them before looking for the call, and a factory inside them registers exactly like a direct call, addon contract included. They can also sit between a cast and the call (`(pikkuConfig(...) as any)`, `pikkuConfig(...)! satisfies X`): the chain is walked through them, and any cast in it is `PKU564`.

**Why fail rather than see through the cast.** The inspector could unwrap the cast and register the factory. It does not, because the cast exists to hide a type mismatch between what the factory returns and what it is declared to be. Registering the factory would let that mismatch reach runtime. Failing makes the author fix the type.

**Why it has to be loud.** Before this check, a cast made the factory invisible, and nothing said so. In the pikkustudio controlplane an addon exported `pikkuAddonServices(...) as unknown as CreateSingletonServices<...>`; no `pikku-package.gen.ts` was generated, the addon's factories were never registered, and its workflows failed at runtime with `WorkflowNotFoundError`.

Only the call's own wrapping counts. A cast inside the factory's body, or around any other call, is not reported. An export that also carries a type annotation (`: CreateSingletonServices = pikkuServices(...) as X`) is still registered through the annotation, and is reported anyway, because the cast hides the same mismatch.

**What this rules out:** casting a factory export to make it type-check. Export the call as it is and fix the type.
