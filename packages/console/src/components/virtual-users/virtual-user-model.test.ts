import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { describeAction, toVirtualUserDocs } from './virtual-user-model.js'

// `expose: true` is what puts a function on the rpc transport, and only those
// reach the catalogue. It is set on the step too, so that step's absence from
// the surface is attributable to `scenarioStep` rather than to it merely being
// unexposed.
const functions = {
  listOrders: { name: 'listOrders', expose: true },
  refundOrder: {
    name: 'refundOrder',
    expose: true,
    scopes: ['finance:refund'],
  },
  payOutSupplier: {
    name: 'payOutSupplier',
    expose: true,
    approvalRequired: true,
  },
  archiveOrder: { name: 'archiveOrder', expose: true, readonly: false },
  buysAnApple: {
    name: 'buysAnApple',
    expose: true,
    scenarioStep: true,
    scenarioStepTemplate: 'buys an apple',
  },
} as any

const workflows = {
  refundFlow: {
    name: 'refundFlow',
    scenario: true,
    title: 'A shopper is refunded',
    actors: ['shopper'],
    steps: [
      {
        type: 'scenarioStep',
        stepFunc: 'buysAnApple',
        phase: 'given',
        actor: 'shopper',
      },
    ],
  },
  adminFlow: {
    name: 'adminFlow',
    scenario: true,
    title: 'An admin closes the books',
    actors: ['admin'],
  },
} as any

const systemRoles = {
  refunder: { name: 'refunder', scopes: ['finance:refund'] },
} as any

const features = {
  refunds: { name: 'Refunds', entries: [{ scenario: 'refundFlow' }] },
}

const build = (personas: any) =>
  toVirtualUserDocs({
    personas,
    systemRoles,
    functions,
    workflows,
    features: features as any,
  })

const persona = (overrides: Record<string, unknown> = {}) => ({
  shopper: {
    id: 'shopper',
    name: 'Sam Shopper',
    email: 'sam@example.com',
    jobTitle: 'Shopper',
    disposition: 'realistic',
    roles: [],
    goals: [],
    tags: [],
    runnable: true,
    ...overrides,
  },
})

describe('the virtual user reading model', () => {
  test('the persona is the identity — no second registry to look them up in', () => {
    const [doc] = build(persona())
    assert.equal(doc!.persona.key, 'shopper')
    assert.equal(doc!.persona.name, 'Sam Shopper')
    assert.equal(doc!.persona.email, 'sam@example.com')
  })

  // Someone declared `runnable: false` exists to be banned, shared with or
  // reset. Showing what a run of them would look like would describe a run that
  // cannot happen.
  test('a persona who is only ever acted upon is not shown as a virtual user', () => {
    const docs = build({
      ...persona(),
      target: {
        id: 'target',
        name: 'Terry Target',
        roles: [],
        goals: [],
        tags: [],
        runnable: false,
      },
    })
    assert.deepEqual(
      docs.map((doc) => doc.id),
      ['shopper']
    )
  })

  test('a persona who declares no disposition is realistic', () => {
    const [doc] = build(persona({ disposition: undefined }))
    assert.equal(doc!.disposition, 'realistic')
  })

  test('only the scenarios that cast this persona become intents', () => {
    const [doc] = build(persona())
    assert.deepEqual(
      doc!.intents.map((intent) => intent.id),
      ['refundFlow']
    )
    assert.equal(doc!.featureByIntent.refundFlow, 'Refunds')
  })

  test('an intent carries prose, never the rpc names behind it', () => {
    const [doc] = build(persona())
    const rendered = JSON.stringify(doc!.intents)
    assert.ok(!rendered.includes('buysAnApple'))
  })

  test('a persona in no scenarios with no goals is reported as having nothing to want', () => {
    const [doc] = build(persona({ id: 'ghost' }))
    assert.equal(doc!.intents.length, 0)
    assert.equal(doc!.goals.length, 0)
  })

  test('scenario steps are not endpoints, so they are not part of the surface', () => {
    const [doc] = build(persona())
    assert.equal(doc!.reach.total, 4)
  })

  // Approval-gated calls spend money and move real traffic, so opting in is a
  // decision made at the moment of running. The declaration view can only ever
  // show the default, which is that they are withheld.
  test('approval-gated calls are held back', () => {
    const [doc] = build(persona())
    assert.equal(doc!.reach.withheldByApproval, 1)
    assert.ok(!doc!.reach.offeredNames.includes('payOutSupplier'))
  })

  test('a scope-gated call is out of reach until a role confers it', () => {
    const [without] = build(persona())
    assert.equal(without!.reach.withheldByScopes, 1)
    assert.ok(!without!.reach.offeredNames.includes('refundOrder'))
    assert.deepEqual(without!.scopes, [])

    const [with_] = build(persona({ roles: ['refunder'] }))
    assert.equal(with_!.reach.withheldByScopes, 0)
    assert.ok(with_!.reach.offeredNames.includes('refundOrder'))
    assert.deepEqual(with_!.scopes, ['finance:refund'])
    assert.ok(!with_!.reach.showsEverything)
  })

  test('an adversarial persona is shown what its roles do not cover, on purpose', () => {
    const [doc] = build(persona({ disposition: 'adversarial' }))
    assert.equal(doc!.reach.withheldByScopes, 0)
    assert.ok(doc!.reach.showsEverything)
    assert.ok(doc!.reach.offeredNames.includes('refundOrder'))
  })

  test('an auditor is never offered a mutation', () => {
    const [doc] = build(persona({ disposition: 'auditor' }))
    assert.equal(doc!.reach.mutations, 0)
    assert.ok(doc!.reach.withheldByReadOnly > 0)
  })

  test('read or write guessed from a name is counted, so the gap is visible', () => {
    const [doc] = build(persona())
    // Only archiveOrder annotates `readonly`; the rest rest on the heuristic.
    assert.equal(doc!.reach.inferred, 3)
  })

  // A count you cannot open is a count you have to take on trust, and the
  // three figures are the entry point to the endpoints they stand for.
  test('every reach figure names the endpoints it counts', () => {
    const [doc] = build(persona({ roles: ['refunder'] }))
    // payOutSupplier is approval-gated, so it is counted by the catalogue and
    // named by nothing this persona is offered.
    assert.deepEqual(doc!.reach.offeredNames.sort(), [
      'archiveOrder',
      'listOrders',
      'refundOrder',
    ])
    assert.ok(!doc!.reach.mutationNames.includes('listOrders'))
    assert.equal(doc!.reach.mutationNames.length, doc!.reach.mutations)
    assert.ok(!doc!.reach.inferredNames.includes('archiveOrder'))
    assert.equal(doc!.reach.inferredNames.length, doc!.reach.inferred)
  })

  test('the names track what was withheld, not the whole catalogue', () => {
    const [doc] = build(persona({ disposition: 'auditor' }))
    assert.deepEqual(doc!.reach.mutationNames, [])
    assert.ok(!doc!.reach.offeredNames.includes('archiveOrder'))
  })

  test('wanting is counted as well as listed, so a long list still reads', () => {
    const [doc] = build(persona())
    assert.deepEqual(doc!.wants, {
      intents: 1,
      features: 1,
      steps: 1,
      byFeature: [{ name: 'Refunds', count: 1 }],
    })
  })

  test('an intent no feature claims is still an intent, just not in the spread', () => {
    const [doc] = build(persona())
    const unclaimed = toVirtualUserDocs({
      personas: persona() as any,
      systemRoles,
      functions,
      workflows,
      features: {} as any,
    })[0]!
    assert.equal(unclaimed.wants.intents, doc!.wants.intents)
    assert.equal(unclaimed.wants.features, 0)
    assert.deepEqual(unclaimed.wants.byFeature, [])
  })

  // The screen shows the merged profile, so a tuned persona has to say so — a
  // `careless` one whose numbers quietly disagree with the careless blurb is
  // worse than no numbers at all.
  test('tuning is merged into the profile and named as an override', () => {
    const [doc] = build(
      persona({ tuning: { repeatRate: 0.4, moves: { suspend: 30 } } })
    )
    assert.equal(doc!.profile.repeatRate, 0.4)
    assert.equal(doc!.profile.moves.suspend, 30)
    // Untouched dials still come from the disposition.
    assert.equal(doc!.profile.moves.continue, 88)
    assert.deepEqual(doc!.tunedDials, ['repeatRate', 'moves'])
  })

  test('an untuned persona names no overrides', () => {
    const [doc] = build(persona())
    assert.deepEqual(doc!.tunedDials, [])
  })

  test('tuning readOnly off changes what the reach section reports', () => {
    const [stock] = build(persona({ disposition: 'auditor' }))
    const [writing] = build(
      persona({ disposition: 'auditor', tuning: { readOnly: false } })
    )
    assert.equal(stock!.reach.mutations, 0)
    assert.ok(writing!.reach.mutations > 0)
  })

  // The screen has the declaration, not the project's config, so it cannot
  // enumerate what "everywhere but production" comes to — and resolving it here
  // against a guess would be worse than saying the rule.
  test('a declared environment list is carried, and an absent one stays absent', () => {
    const [named] = build(
      persona({ disposition: 'accountable', environments: ['prod'] })
    )
    assert.deepEqual(named!.environments, ['prod'])
    assert.equal(build(persona())[0]!.environments, undefined)
  })

  test('personas are listed by name, so the rail reads alphabetically', () => {
    const docs = build({
      ...persona({ name: 'Zoe' }),
      admin: {
        id: 'admin',
        name: 'Ada',
        disposition: 'auditor',
        roles: [],
        goals: [],
        tags: [],
        runnable: true,
      },
    })
    assert.deepEqual(
      docs.map((doc) => doc.name),
      ['Ada', 'Zoe']
    )
  })
})

describe('describeAction', () => {
  test('names a call by the rpc it made', () => {
    assert.equal(
      describeAction({ kind: 'call', rpcName: 'listDocs' }),
      'listDocs'
    )
  })

  test('an agent turn is named by the agent it talked to', () => {
    assert.equal(
      describeAction({ kind: 'agent', agent: 'adminAgent' }),
      'adminAgent'
    )
  })

  // The turn the model got wrong carries no name at all, and it is the one
  // somebody reading a transcript is looking for.
  test('falls back to the kind when there is no name', () => {
    assert.equal(
      describeAction({ kind: 'invalid', detail: 'no such rpc' }),
      'invalid'
    )
  })

  test('an action with neither is still a step', () => {
    assert.equal(describeAction({}), 'step')
  })
})
