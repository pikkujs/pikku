import { defineFeatureFlags } from '#pikku/scopes'

/**
 * The flags the e2e suite exercises, one per shape the resolver has to answer.
 *
 * `quarterlyReports` carries an `anyOf`, so it is the flag where `capable` and
 * `available` can disagree — the `guest` actor holds `reports:read` from the
 * seed and the `admin` actor does not. `bulkExport` has no capability
 * constraint at all, which is the pure kill-switch shape. `darkLaunch` is
 * declared and never switched on, so it is the one an operator has to reach
 * for it to do anything.
 */
defineFeatureFlags({
  quarterlyReports: {
    description: 'The quarterly reports panel',
    anyOf: ['reports:read'],
  },
  bulkExport: {
    description: 'Export every report at once',
  },
  darkLaunch: {
    description: 'Declared in code, switched on by nobody',
  },
})
