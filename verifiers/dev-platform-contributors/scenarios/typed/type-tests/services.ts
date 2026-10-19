// Type-level checks that `#pikku/contributor` types `services` as the
// project's own SingletonServices. Compiled by tsc only
// (tsconfig.type-tests.json); never executed. Every check fails if `services`
// were `any`.
import type { Contributor } from '#pikku/contributor'
import type { Ledger, SingletonServices } from '../types/application-types.js'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type IsAny<T> = 0 extends 1 & T ? true : false
const assertType = <_T extends true>() => {}

type RunServices = Parameters<Contributor['run']>[0]
type StartServices = Parameters<NonNullable<Contributor['onServerStart']>>[0]
type StopServices = Parameters<NonNullable<Contributor['onServerStop']>>[0]

assertType<Equal<IsAny<RunServices>, false>>()
assertType<Equal<IsAny<StartServices>, false>>()
assertType<Equal<RunServices, SingletonServices>>()
assertType<Equal<StartServices, SingletonServices>>()
assertType<Equal<StopServices, SingletonServices>>()
assertType<Equal<SingletonServices['ledger'], Ledger | undefined>>()

export const wrong: Contributor = {
  run(services) {
    // @ts-expect-error not a service of this project
    void services.noSuchService
    // @ts-expect-error ledger.record takes a string
    services.ledger?.record(42)
  },
  onServerStart(services) {
    // @ts-expect-error not a service of this project
    void services.alsoNotAService
  },
}
