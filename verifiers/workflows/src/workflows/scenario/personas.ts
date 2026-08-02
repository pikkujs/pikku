import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

/**
 * The two people `orderHealthScenario` casts.
 *
 * Declared in code rather than in `pikku.config.json` so the verifier exercises
 * the path a real project takes — codegen reads these definitions, computes the
 * addresses from `scenarios.emailDomain`, and emits the typed registry the
 * scenario's `actors` slots are checked against.
 */
definePersonas({
  customer: {
    name: 'Customer',
    jobTitle: 'Customer',
    personality: 'Impatient first-time buyer who abandons slow checkouts',
    account: {},
  },
  ops: {
    name: 'Ops',
    jobTitle: 'Operations manager',
    account: {},
  },
})
