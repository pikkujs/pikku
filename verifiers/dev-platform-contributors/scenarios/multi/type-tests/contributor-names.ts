// Type-level checks for the names `wireAddon({ contributors })` accepts. This
// file is compiled by tsc only (tsconfig.type-tests.json); it sits outside
// srcDirectories because the inspector would otherwise read the deliberately
// wrong calls below and fail the build with PKU363, which is the backstop and
// not what is under test here. It never runs.
import { wireAddon } from '#pikku/addon'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const assertType = <_T extends true>() => {}

type NamesOf<Package extends string> = NonNullable<
  Parameters<typeof wireAddon<Package>>[0]['contributors']
>[number]

// The union is exactly what the addon registers: nothing extra, nothing
// missing, and not widened to string.
assertType<
  Equal<
    NamesOf<'@verifier/contrib-select'>,
    | 'store-postgres'
    | 'store-sqlite'
    | 'queue-real'
    | 'queue-noop'
    | 'edge-queue'
    | 'kysely-fake'
  >
>()
assertType<
  Equal<string extends NamesOf<'@verifier/contrib-notify'> ? 1 : 0, 0>
>()

export const typed = () => {
  wireAddon({
    name: 'select',
    package: '@verifier/contrib-select',
    contributors: ['store-sqlite', 'queue-noop'],
  })

  wireAddon({
    name: 'select',
    package: '@verifier/contrib-select',
    // @ts-expect-error 'store-mysql' is not registered by @verifier/contrib-select
    contributors: ['store-mysql'],
  })

  wireAddon({
    name: 'notify',
    package: '@verifier/contrib-notify',
    // @ts-expect-error a contributor of @verifier/contrib-select is not one of notify's
    contributors: ['store-sqlite'],
  })

  // An addon whose contributors meta is not installed falls back to string, so
  // the build-time check is the only guard and the type does not block it.
  wireAddon({
    name: 'elsewhere',
    package: '@verifier/not-installed',
    contributors: ['anything'],
  })
}
