import type {
  FactoryPayload,
  MantineComponent,
  MantinePolymorphicComponent,
} from '@mantine/core'

// Mantine's `PolymorphicFactoryPayload` isn't a public export; reconstruct its
// shape from the public `FactoryPayload`.
type PolyPayload = FactoryPayload & { defaultComponent: any; defaultRef: any }

// Homomorphic mapped type: preserves every payload key (defaultComponent,
// defaultRef, stylesNames, variant, staticComponents…) and rewrites only `props`
// so the override wins over the original prop types.
type WithProps<F, O> = {
  [K in keyof F]: K extends 'props' ? Omit<F[K & 'props'], keyof O> & O : F[K]
}

/** Narrow a polymorphic Mantine component's props while keeping `component=`. */
export type OverridePoly<
  F extends PolyPayload,
  O,
> = MantinePolymorphicComponent<WithProps<F, O>>

/** Narrow a plain (non-polymorphic) Mantine component's props. */
export type OverrideFactory<F extends FactoryPayload, O> = MantineComponent<
  WithProps<F, O>
>

// For compound components (Menu, Tabs, Stepper…) whose factory doesn't surface
// `staticComponents`: override only the named statics, KEEP every other static
// (Menu.Divider, Menu.Sub, Tabs.List…), and preserve the parent's own call
// signature. `CallSig` keeps callability (mapped types strip it); the mapped
// type keeps all static keys.
type CallSig<T> = T extends (...a: infer A) => infer R
  ? (...a: A) => R
  : unknown
type OverrideStatics<T, O> = { [K in keyof T]: K extends keyof O ? O[K] : T[K] }
export type WithStatics<T, O> = CallSig<T> & OverrideStatics<T, O>
