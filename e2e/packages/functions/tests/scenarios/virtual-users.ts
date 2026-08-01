/**
 * Virtual users for the e2e app.
 *
 * A scenario proves a path somebody thought of. These four work the same ground
 * without the script: they are handed the scenario prose for their own actor,
 * the schema of every rpc they are allowed to see, and nothing else — no step
 * graph, no rpc names lifted out of a feature file. What they do with that is
 * the model's business, which is the point: the bugs worth finding are the ones
 * nobody wrote a `then` for.
 *
 * They assert nothing. The oracles do that: a 5xx, a transport throw, a
 * response that violates its own output schema, or a call that succeeds when
 * the declared grants say it should not have.
 *
 * Run one against a stage with `pikku virtual-user run local <id>`.
 */
import { pikkuVirtualUser } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * The careless disposition is the closest thing to a real first-time buyer:
 * it abandons things halfway, picks them back up out of order, and repeats a
 * call it already made because it did not notice the first one worked.
 */
export const impatientShopper = pikkuVirtualUser({
  name: 'Impatient shopper',
  description:
    'Starts more than it finishes, and rarely finishes in the order the feature intended',
  actor: 'shopper',
  disposition: 'careless',
  goals: [
    'Keep a todo list roughly in order — add things, tick them off, change my mind',
    'Ask an agent to do the boring part, then interrupt it and do it by hand',
    'Look at whatever the app will show me about my own account',
  ],
  tags: ['virtual-user', 'shopper'],
  budget: { steps: 40, mutations: 15 },
})

/**
 * Support is the one disposition that reads before it writes, so it is the
 * likeliest to notice a response that does not match its own schema.
 */
export const methodicalSupport = pikkuVirtualUser({
  name: 'Methodical support agent',
  description:
    'Works a queue the way an agent actually does: reads, re-reads, then acts',
  actor: 'support',
  disposition: 'realistic',
  goals: [
    'Find out who I am signed in as and what that entitles me to',
    'Look up a customer, read their todos, and fix the ones that are obviously wrong',
    'Use the agent tools rather than the raw rpcs where both would do',
  ],
  tags: ['virtual-user', 'support'],
  budget: { steps: 60, mutations: 20 },
})

/**
 * `auditor` is read-only at the engine level, so no mutation is ever offered to
 * it — it cannot damage a stage even if the model decides it wants to. Its job
 * is breadth: touch every readable endpoint and see which ones lie about their
 * own shape.
 */
export const reportReader = pikkuVirtualUser({
  name: 'Report reader',
  description:
    'Reads everything it is allowed to read and never writes, on purpose',
  actor: 'guest',
  disposition: 'auditor',
  goals: [
    'Read every report I can reach and check the numbers are the shape they claim to be',
    'Follow anything a report points at until it stops pointing somewhere',
  ],
  tags: ['virtual-user', 'guest', 'read-only'],
  budget: { steps: 50 },
})

/**
 * The staff actor holds the `admin` scope but not the `console-admin` role,
 * which is exactly the seam the console-authz scenarios test one assertion at a
 * time. Adversarial is shown the whole catalogue rather than the narrowed one —
 * being offered a call it should not be able to make is the test — while
 * `grants` stays live as the oracle: a success outside this list is a finding,
 * not a pass.
 */
export const scopeProber = pikkuVirtualUser({
  name: 'Scope prober',
  description:
    'Holds admin scope without the console-admin role, and goes looking for the gap',
  actor: 'staff',
  disposition: 'adversarial',
  goals: [
    'Find something the console will let me do that my role was never meant to cover',
    'Try to read or change a record that belongs to somebody else',
    'Get at an admin capability by the side door — an agent, a workflow, a raw rpc',
  ],
  tags: ['virtual-user', 'staff', 'adversarial'],
  grants: ['isRecordOwner'],
  budget: { steps: 80, mutations: 10 },
})
