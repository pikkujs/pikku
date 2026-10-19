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
    // `receptionist`, not `guest`. This persona's job is the smoke gate — sign
    // in and prove every screen renders — and the front desk needs
    // `rooms:read`, which a guest correctly does not have, so as a guest it
    // failed the gate by working exactly as designed. `nadia` is the real
    // guest, so nothing is lost by making this one staff.
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    roles: ['receptionist'],
    personality: 'Signs in and checks their own session — proves auth end to end',
    account: {},
  },

  nadia: {
    name: 'Nadia Rahman',
    jobTitle: 'Guest',
    description: 'Travels for work most months, books late and changes plans',
    roles: ['guest'],
    personality:
      'Brisk. Books from her phone between meetings, and will abandon a form that asks for anything she has already given.',
    goals: ['Get a room for the nights she needs without phoning anyone'],
    account: {},
  },
  /**
   * Holds the whole booking lifecycle but cannot close a housekeeping task —
   * the seam the scope model exists to express. A scenario run as Rafa proves
   * the front desk can check somebody in; one run as Priya proves it cannot
   * mark the room clean on housekeeping's behalf.
   */
  rafa: {
    name: 'Rafa Oliveira',
    jobTitle: 'Receptionist',
    description: 'Works the front desk on early shift',
    roles: ['receptionist'],
    personality:
      'Unflappable. Does three things at once and expects the arrivals list to be right without refreshing it.',
    goals: ['Get every arrival into a clean room without keeping anyone waiting'],
    account: {},
  },
  priya: {
    name: 'Priya Nair',
    jobTitle: 'Housekeeper',
    description: 'Turns rooms around between departures and arrivals',
    roles: ['housekeeper'],
    personality:
      'Methodical. Works a floor at a time and marks a room done the moment it is, not at the end of the round.',
    goals: ['Clear the turnover list before the afternoon arrivals'],
    account: {},
  },
  /**
   * The one persona left at the default disposition. Running an adversarial
   * manager against a real stage would be a penetration test of your own
   * bookings, which is not something a template should teach by example.
   */
  morgan: {
    name: 'Morgan Ellis',
    jobTitle: 'General manager',
    description: 'Runs the property — rates, staffing and what the numbers say',
    roles: ['manager'],
    personality:
      'Impatient with detail. Wants occupancy and revenue on one screen and will not click twice for it.',
    goals: ['Know tonight’s occupancy', 'Spot a bad week before it finishes'],
    account: {},
  },
})
// @snippet end definePersonas
