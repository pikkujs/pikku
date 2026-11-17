import { wireContributors } from '@pikku/core/contributors'

/*
 * Outside `src/`, so `pikku all` does not read it as a real opt-in: it would
 * look for the package's contributors meta. The shop's tsconfig still compiles
 * it.
 */
// @snippet start wireContributors
wireContributors({
  package: '@acme/jobs',
  contributors: ['queue'],
})
// @snippet end wireContributors
