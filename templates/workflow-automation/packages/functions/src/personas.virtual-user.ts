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
    // `viewer` reads everything and changes nothing — exactly the grant a
    // mutationless smoke sweep needs, and nothing more.
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    roles: ['viewer'],
    personality: 'Signs in and checks their own session — proves auth end to end',
    account: {},
  },
  /**
   * Builds the flows. Holds `flows` whole and `runs:read` — can see what their
   * automation did without being able to cancel somebody else's run.
   */
  dev: {
    name: 'Devi Sharma',
    jobTitle: 'Automation builder',
    description: 'Wires up the integrations the rest of the company asks for',
    roles: ['builder'],
    personality:
      'Impatient with clicking. Wants to duplicate an existing flow and edit two nodes rather than start from an empty canvas.',
    goals: ['Get a working flow live without asking anyone for access'],
    account: {},
  },
  /**
   * On call. Holds cancel and replay but cannot edit a flow — the separation
   * the role model exists to draw.
   */
  ola: {
    name: 'Ola Nkemdirim',
    jobTitle: 'Platform operator',
    description: 'Watches the run queue and unsticks things',
    roles: ['operator'],
    personality:
      'Calm under a pager. Reads the step output before touching anything, and writes down what they did.',
    goals: ['Get the queue back to green', 'Know which flow caused it'],
    account: {},
  },
  sam: {
    name: 'Sam Whitfield',
    jobTitle: 'Analyst',
    description: 'Depends on flows they did not build and cannot change',
    roles: ['viewer'],
    personality:
      'Asks precise questions. Wants to know whether last night\'s run succeeded, not how the flow works.',
    goals: ['Find out if the overnight sync ran'],
    account: {},
  },
})
// @snippet end definePersonas
