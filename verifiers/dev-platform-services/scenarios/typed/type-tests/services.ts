// Type-level checks that `#pikku/provider` types `services` as the project's own
// SingletonServices plus what each service provides. Compiled by tsc only
// (tsconfig.type-tests.json); never executed. Every check fails if `services`
// were `any`.
import { defineProvider } from '#pikku/provider'
import type { SingletonServices } from '#pikku/provider'
import type { SingletonServices as FunctionServices } from '#pikku/function'
import type { Ledger } from '../types/application-types.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type IsAny<T> = 0 extends 1 & T ? true : false
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const assertType = <_T extends true>() => {}

assertType<Equal<IsAny<SingletonServices['logger']>, false>>()
assertType<Equal<IsAny<SingletonServices['ledger']>, false>>()
// What the service provides is required, not optional as the declared type had it.
assertType<Mutual<SingletonServices['ledger'], Ledger>>()
// A function sees the same merged type without a cast.
assertType<Equal<FunctionServices, SingletonServices>>()

export const wrong = defineProvider({
  common: (services) => {
    // @ts-expect-error not a service of this project
    void services.noSuchService
    // @ts-expect-error ledger.record takes a string
    services.ledger.record(42)
    return {}
  },
})
