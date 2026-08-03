/**
 * The people who use the e2e app.
 *
 * One declaration serves both halves of the suite. A scenario borrows a persona
 * as an actor and drives it through a script somebody wrote; `pikku persona run`
 * hands the same person the scenario prose for their own actor, the schema of
 * every rpc their roles let them see, and nothing else — no step graph, no rpc
 * names lifted out of a feature file. What they do with that is the model's
 * business, which is the point: the bugs worth finding are the ones nobody
 * wrote a `then` for.
 *
 * A run asserts nothing. The oracles do that: a 5xx, a transport throw, a
 * response that violates its own output schema, or a call that succeeds when
 * the caller's roles say it should not have.
 *
 * Their addresses are computed from these ids and `scenarios.emailDomain`, so
 * `shopper` reads mail at shopper@actors.local without anyone writing it down.
 */
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

definePersonas({
  /**
   * The careless disposition is the closest thing to a real first-time buyer:
   * it abandons things halfway, picks them back up out of order, and repeats a
   * call it already made because it did not notice the first one worked.
   *
   * Ran as a virtual user with roughly `--steps=40 --mutations=15`.
   */
  shopper: {
    name: 'Shopper',
    jobTitle: 'First-time buyer',
    description:
      'Starts more than they finish, and rarely finish in the order the feature intended',
    personality: 'Impatient shopper who abandons slow checkouts',
    account: {},
    disposition: 'careless',
    goals: [
      'Keep a todo list roughly in order — add things, tick them off, change my mind',
      'Ask an agent to do the boring part, then interrupt it and do it by hand',
      'Look at whatever the app will show me about my own account',
    ],
    tags: ['shopper'],
    // `careless` ships at an 18% repeat rate and 18 parts suspend, which is a
    // guess about people in general. This app is a todo list used on a phone:
    // being interrupted is the normal case, not the exception, and the submit
    // gives no feedback worth trusting — so both go up. They are still a
    // careless user; they are careless about *this* product.
    tuning: {
      repeatRate: 0.3,
      moves: { suspend: 26 },
    },
  },

  /**
   * Support is the one disposition that reads before it writes, so it is the
   * likeliest to notice a response that does not match its own schema. Ran with
   * roughly `--steps=60 --mutations=20`.
   */
  support: {
    name: 'Support',
    jobTitle: 'Support agent',
    description:
      'Works a queue the way an agent actually does: reads, re-reads, then acts',
    personality: 'Methodical agent who double-checks every order',
    account: {},
    disposition: 'realistic',
    goals: [
      'Find out who I am signed in as and what that entitles me to',
      'Look up a customer, read their todos, and fix the ones that are obviously wrong',
      'Use the agent tools rather than the raw rpcs where both would do',
    ],
    tags: ['support'],
  },

  /**
   * The one person who holds both halves of administration, and therefore the
   * only one for whom the console's Scopes UI returns 200 throughout.
   */
  admin: {
    name: 'Admin',
    jobTitle: 'Console administrator',
    // The one persona here carrying a picture, so the console's avatar has both
    // branches covered by the same suite. Same-origin and always served, which
    // an external URL would not be on a machine with no network.
    avatarUrl: '/console/pikku-console-logo.png',
    description:
      'Edits code through the console and always puts it back the way they found it',
    personality:
      'Careful operator who edits code through the console and always restores it',
    account: {},
    roles: ['platform-admin', 'console-admin'],
    goals: [
      'Keep the console doing what it says it does, and change nothing I cannot undo',
    ],
    tags: ['admin'],
  },

  /**
   * Holds the `admin` umbrella through `platform-admin` but not `console-admin`,
   * which is exactly the seam the console-authz scenarios test one assertion at
   * a time. Adversarial is shown the whole catalogue rather than the narrowed
   * one — being offered a call they should not be able to make is the test —
   * while their roles stay live as the oracle: a success outside what those
   * roles confer is a finding, not a pass. Ran with roughly `--steps=80
   * --mutations=10`.
   */
  staff: {
    name: 'Staff',
    jobTitle: 'Console admin without a scope role',
    description:
      'Holds admin scope without the console-admin role, and goes looking for the gap',
    personality:
      'Support staff who can open the console but cannot administer scopes',
    account: {},
    roles: ['platform-admin'],
    disposition: 'adversarial',
    goals: [
      'Find something the console will let me do that my role was never meant to cover',
      'Try to read or change a record that belongs to somebody else',
      'Get at an admin capability by the side door — an agent, a workflow, a raw rpc',
    ],
    tags: ['staff', 'adversarial'],
  },

  /**
   * `auditor` is read-only at the engine level, so no mutation is ever offered
   * to them — they cannot damage a stage even if the model decides it wants to.
   * Their job is breadth: touch every readable endpoint and see which ones lie
   * about their own shape. Ran with roughly `--steps=50`.
   */
  guest: {
    name: 'Guest',
    jobTitle: 'Report reader',
    description:
      'Reads everything they are allowed to read and never writes, on purpose',
    personality: 'Read-only user who can see reports and nothing else',
    account: {},
    roles: ['report-viewer'],
    disposition: 'auditor',
    goals: [
      'Read every report I can reach and check the numbers are the shape they claim to be',
      'Follow anything a report points at until it stops pointing somewhere',
    ],
    tags: ['guest', 'read-only'],
  },

  /**
   * Declared and seeded, never run. `target` exists to be banned, unbanned and
   * reset by other people, so a run that signed in as them would only be
   * racing the scenario doing it.
   */
  target: {
    name: 'Target',
    jobTitle: 'Subject of user administration',
    description: 'The account other people administer',
    personality:
      'Ordinary user who gets banned, unbanned and reset by other people',
    account: {},
    runnable: false,
  },
})
