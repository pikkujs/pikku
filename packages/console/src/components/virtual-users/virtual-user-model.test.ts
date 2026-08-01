import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { toVirtualUserDocs } from './virtual-user-model.js'

const functions = {
  listOrders: { name: 'listOrders' },
  refundOrder: {
    name: 'refundOrder',
    permissions: [{ name: 'isFinance' }],
  },
  payOutSupplier: {
    name: 'payOutSupplier',
    approvalRequired: true,
  },
  archiveOrder: { name: 'archiveOrder', readonly: false },
  buysAnApple: { name: 'buysAnApple', scenarioStep: true },
} as any

const workflows = {
  refundFlow: {
    name: 'refundFlow',
    scenario: true,
    title: 'A shopper is refunded',
    actors: ['shopper'],
    steps: [
      { type: 'scenarioStep', stepFunc: 'buysAnApple', phase: 'given', actor: 'shopper' },
    ],
  },
  adminFlow: {
    name: 'adminFlow',
    scenario: true,
    title: 'An admin closes the books',
    actors: ['admin'],
  },
} as any

const scenarioActors = {
  shopper: { name: 'Sam Shopper', email: 'sam@example.com', jobTitle: 'Shopper' },
}

const features = {
  refunds: { name: 'Refunds', entries: [{ scenario: 'refundFlow' }] },
}

const build = (virtualUsers: any) =>
  toVirtualUserDocs({
    virtualUsers,
    functions,
    workflows,
    scenarioActors,
    features: features as any,
  })

const user = (overrides: Record<string, unknown> = {}) => ({
  shopper: {
    id: 'shopper',
    name: 'Impatient shopper',
    actor: 'shopper',
    disposition: 'realistic',
    goals: [],
    tags: [],
    ...overrides,
  },
})

describe('the virtual user reading model', () => {
  test('shows who the actor actually is, not just their key', () => {
    const [doc] = build(user())
    assert.equal(doc!.persona.name, 'Sam Shopper')
    assert.equal(doc!.persona.email, 'sam@example.com')
  })

  test('an unknown actor still reads, under its own key', () => {
    const [doc] = build(user({ actor: 'ghost' }))
    assert.equal(doc!.persona.name, 'ghost')
  })

  test('only the scenarios that name this actor become intents', () => {
    const [doc] = build(user())
    assert.deepEqual(
      doc!.intents.map((intent) => intent.id),
      ['refundFlow']
    )
    assert.equal(doc!.featureByIntent.refundFlow, 'Refunds')
  })

  test('an intent carries prose, never the rpc names behind it', () => {
    const [doc] = build(user())
    const rendered = JSON.stringify(doc!.intents)
    assert.ok(!rendered.includes('buysAnApple'))
  })

  test('a user with no scenarios and no goals is reported as having nothing to want', () => {
    const [doc] = build(user({ actor: 'ghost' }))
    assert.equal(doc!.intents.length, 0)
    assert.equal(doc!.goals.length, 0)
  })

  test('scenario steps are not endpoints, so they are not part of the surface', () => {
    const [doc] = build(user())
    assert.equal(doc!.reach.total, 4)
  })

  test('approval-gated calls are held back unless the declaration opts in', () => {
    const [held] = build(user())
    assert.equal(held!.reach.withheldByApproval, 1)
    assert.equal(held!.reach.offered, 3)

    const [allowed] = build(user({ allowApprovalRequired: true }))
    assert.equal(allowed!.reach.withheldByApproval, 0)
    assert.equal(allowed!.reach.offered, 4)
  })

  test('grants narrow what an ordinary user is offered', () => {
    const [doc] = build(user({ grants: ['isShopper'] }))
    assert.equal(doc!.reach.withheldByGrants, 1)
    assert.ok(!doc!.reach.showsEverything)
  })

  test('an adversarial user is shown everything its grants do not cover, on purpose', () => {
    const [doc] = build(
      user({ disposition: 'adversarial', grants: ['isShopper'] })
    )
    assert.equal(doc!.reach.withheldByGrants, 0)
    assert.ok(doc!.reach.showsEverything)
    assert.ok(doc!.reach.offered >= 3)
  })

  test('an auditor is never offered a mutation', () => {
    const [doc] = build(user({ disposition: 'auditor' }))
    assert.equal(doc!.reach.mutations, 0)
    assert.ok(doc!.reach.withheldByReadOnly > 0)
  })

  test('read or write guessed from a name is counted, so the gap is visible', () => {
    const [doc] = build(user())
    // Only archiveOrder annotates `readonly`; the rest rest on the heuristic.
    assert.equal(doc!.reach.inferred, 3)
  })

  test('users are listed by name, so the rail reads alphabetically', () => {
    const docs = build({
      ...user({ name: 'Zoe' }),
      admin: {
        id: 'admin',
        name: 'Ada',
        actor: 'admin',
        disposition: 'auditor',
        goals: [],
        tags: [],
      },
    })
    assert.deepEqual(
      docs.map((doc) => doc.name),
      ['Ada', 'Zoe']
    )
  })
})
