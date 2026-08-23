/**
 * The people this app is for, and the people its scenarios run as.
 *
 * One `definePersonas` call for the whole project — codegen builds the
 * `PersonaId` union from it, materialises one scenario actor per person, and
 * seeds a user row each, so a second call site would be a second answer to
 * "who uses this app". Add yours here.
 *
 * Addresses are never written down: each is derived from the persona id and
 * `scenarios.emailDomain` in pikku.config.json, so `visitor` signs in as
 * visitor@actors.local. Writing one by hand is how a run signs in as somebody
 * who was never created.
 */
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

// @snippet start definePersonas
definePersonas({
  visitor: {
    // A customer, like the people this app is for. The catalogue happens to be
    // readable without a session, so this is not what makes the smoke gate
    // pass — it is what stops the gate depending on that staying true.
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    roles: ['customer'],
    personality:
      'Signs in and checks their own session — proves auth end to end',
    account: {},
  },
  shopper: {
    name: 'Susan',
    jobTitle: 'Buys for a small caf\u00e9',
    description: 'Orders stock every week and watches the margins',
    roles: ['customer'],
    personality:
      'Hunts cheap deals. Tries three coupon codes before giving up, and abandons a basket if checkout asks for anything unexpected.',
    goals: ['Get the weekly order in under five minutes'],
    disposition: 'careless',
    account: {},
  },
  /**
   * Holds `orders:refund` without owning any order — the seam that makes the
   * scope-versus-permission split worth demonstrating. A scenario run as Priya
   * proves support can act on somebody else's order; one run as Susan proves a
   * customer cannot.
   */
  priya: {
    name: 'Priya from Support',
    jobTitle: 'Customer support',
    description:
      'Handles refunds and cancellations for other people\u2019s orders',
    roles: ['support'],
    personality:
      'Methodical. Reads the order history before touching anything, and says what she changed.',
    goals: ['Resolve the customer\u2019s problem without escalating'],
    account: {},
  },
  alex: {
    name: 'Alex the Owner',
    jobTitle: 'Shop owner',
    description: 'Runs the shop \u2014 prices, stock and who works here',
    roles: ['admin'],
    personality:
      'Impatient. Knows the catalogue by heart and expects bulk actions to exist.',
    goals: ['Keep stock accurate', 'See what sold this week'],
    account: {},
  },
})
// @snippet end definePersonas
