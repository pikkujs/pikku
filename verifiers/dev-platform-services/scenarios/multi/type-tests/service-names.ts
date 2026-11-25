// Type-level checks for the names `wireAddon({ providers })` accepts. This
// file is compiled by tsc only (tsconfig.type-tests.json); it sits outside
// the inspected source because the inspector would otherwise read the deliberately
// wrong calls below and fail the build with PKU374, which is the backstop and
// not what is under test here. It never runs, and the wirings sit at the top
// level because a wire call inside a function is a build error.
import { wireAddon } from '#pikku/addon'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const assertType = <_T extends true>() => {}

type NamesOf<Package extends string> = NonNullable<
  Parameters<typeof wireAddon<Package>>[0]['providers']
>[number]

// The union is exactly what the addon declares: nothing extra, nothing
// missing, and not widened to string.
assertType<
  Equal<
    NamesOf<'@verifier/svc-select'>,
    'store' | 'queueReal' | 'queueNoop' | 'edgeQueue' | 'kyselyFake'
  >
>()
assertType<Equal<string extends NamesOf<'@verifier/svc-notify'> ? 1 : 0, 0>>()

wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  providers: ['store', 'queueNoop'],
})

wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  // @ts-expect-error 'cacheMiss' is not declared by @verifier/svc-select
  providers: ['cacheMiss'],
})

wireAddon({
  name: 'notify',
  package: '@verifier/svc-notify',
  // @ts-expect-error a provider of @verifier/svc-select is not one of notify's
  providers: ['store'],
})

// An addon whose providers meta is not installed falls back to string, so the
// build-time check is the only guard and the type does not block it.
wireAddon({
  name: 'elsewhere',
  package: '@verifier/not-installed',
  providers: ['anything'],
})
