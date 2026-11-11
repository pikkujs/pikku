# Service factories must be direct calls (PKU564)

The inspector finds an app's or an addon's factories by the call each export is
bound to:

| Wrapper                  | Registers                 |
| ------------------------ | ------------------------- |
| `pikkuServices`          | `CreateSingletonServices` |
| `pikkuAddonServices`     | `CreateSingletonServices` |
| `pikkuWireServices`      | `CreateWireServices`      |
| `pikkuAddonWireServices` | `CreateWireServices`      |
| `pikkuConfig`            | `CreateConfig`            |
| `pikkuAddonConfig`       | `CreateConfig`            |
| `pikkuServerLifecycle`   | `ServerLifecycle`         |

It reads the call itself, through `satisfies` and parentheses, which leave the
factory's type as written. A call inside a cast is invisible to it:

```ts
export const createSingletonServices = pikkuAddonServices(
  async (config, services) => ({ ... })
) as unknown as CreateSingletonServices<Config, SingletonServices>
```

Before `PKU564`, this built without a word. The factory was never registered, so
an addon generated no `pikku-package.gen.ts` and its workflows failed at runtime
with `WorkflowNotFoundError`.

Now the build fails:

```
[PKU564] 'createSingletonServices' at src/services.ts:4 wraps pikkuAddonServices(...) in an `as` cast. The inspector reads a factory only from a direct pikkuAddonServices(...) call, so this one would not be registered and nothing it provides would exist at runtime. Remove the cast, and fix the type mismatch it hides in the factory itself.
```

The same applies to `as`, `<T>` casts and a non-null assertion (`!`), nested or
not, and also when `satisfies` or parentheses sit between the cast and the call.
Both inspectors report it the same way.

`satisfies` and parentheses on their own are fine. These register as if direct:

```ts
export const createConfig = pikkuConfig(async () => ({ ... })) satisfies CreateConfig<Config>
export const createWireServices = (pikkuWireServices(async () => ({ ... })))
```

## Fixing it

Remove the cast and export the call as it is (`satisfies` may stay). An addon whose `Config` adds
required fields, or whose services narrow a core service's type, needs no cast:
the slot core registers addon factories in accepts any package's factory. Any other cast was there because the
factory's type did not match what it was cast to, so fix that mismatch in the
factory itself: the services it returns, or the `SingletonServices` / `Config`
types it is declared against.

A cast _inside_ the factory, such as `schema: {} as any` in the returned object,
is not `PKU564`. Neither is a cast around any other call.
