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
    // An author, so the gate covers the editorial screens and not only the
    // public reading view.
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    roles: ['author'],
    personality: 'Signs in and checks their own session — proves auth end to end',
    account: {},
  },
  mira: {
    name: 'Mira Kova\u010d',
    jobTitle: 'Writer',
    description: 'Writes and edits her own drafts, cannot publish them',
    roles: ['author'],
    personality:
      'Rewrites the opening four times. Leaves things in draft for weeks and expects them to still be private.',
    goals: ['Get a piece finished without anyone seeing it early'],
    account: {},
  },
  /**
   * Holds `posts:publish`, which Mira does not \u2014 the one-way door. A scenario
   * run as Jon proves an editor can make something public; one run as Mira
   * proves an author cannot.
   */
  jon: {
    name: 'Jon Adeyemi',
    jobTitle: 'Editor',
    description: 'Decides what goes live and when',
    roles: ['editor'],
    personality:
      'Reads the whole thing before touching the button, and schedules rather than publishing on a Friday.',
    goals: ['Ship the week\u2019s posts on time', 'Never publish something early'],
    account: {},
  },
})
// @snippet end definePersonas
