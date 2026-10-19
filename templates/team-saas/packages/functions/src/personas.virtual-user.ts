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
    // A plain customer, like the people this app is for. The seed also gives
    // this persona a membership, so its screens have a workspace to render.
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    roles: ['customer'],
    personality: 'Signs in and checks their own session — proves auth end to end',
    account: {},
  },
  /**
   * Owner of one organisation and a plain member of another \u2014 the case a
   * global role cannot express, and the reason membership exists.
   */
  dana: {
    name: 'Dana Osei',
    jobTitle: 'Founder',
    description: 'Runs her own workspace, and consults inside a client\u2019s',
    roles: ['customer'],
    personality:
      'Moves between workspaces all day and expects the one she is in to be obvious without checking.',
    goals: ['Keep her own backlog moving', 'Not post in the wrong workspace'],
    account: {},
  },
  viv: {
    name: 'Viv Marchetti',
    jobTitle: 'Team member',
    description: 'Works in one organisation only',
    roles: ['customer'],
    personality:
      'Head down. Wants the issue she was assigned and nothing else on the screen.',
    goals: ['Close what is assigned to her'],
    account: {},
  },
  /**
   * Your own support staff. Holds admin:impersonate and no write scopes \u2014 can
   * see a customer\u2019s workspace to diagnose it and cannot act inside it.
   */
  sasha: {
    name: 'Sasha Bright',
    jobTitle: 'Customer support',
    description: 'Diagnoses problems inside customers\u2019 workspaces',
    roles: ['support'],
    personality:
      'Careful. Says what she looked at, and asks before touching anything.',
    goals: ['Work out what the customer is actually seeing'],
    account: {},
  },
})
// @snippet end definePersonas
