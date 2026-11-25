import type { SingletonServices, WireServices } from '#pikku/provider'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const assertType = <T extends true>() => undefined as unknown as T

// The merged type holds exactly what the wire providers provide.
assertType<
  Equal<keyof WireServices, 'requestScope' | 'events' | 'maybe' | 'neverBuilt'>
>()
// A key a provider returns only sometimes is optional.
assertType<
  Equal<undefined extends WireServices['maybe'] ? true : false, true>
>()
assertType<
  Equal<undefined extends WireServices['events'] ? true : false, false>
>()
// A per-request key is not a singleton key.
assertType<
  Equal<'requestScope' extends keyof SingletonServices ? true : false, false>
>()
