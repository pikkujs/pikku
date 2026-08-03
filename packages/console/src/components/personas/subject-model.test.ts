import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { toSubjectEntries } from './subject-model.js'

const functions = [
  { name: 'expiresTheTrial', scenarioStepKind: 'platform', sourceFile: 'a.ts' },
  { name: 'rebuildsTheIndex', scenarioStepKind: 'platform' },
  {
    name: 'stripeWebhookArrives',
    scenarioStepKind: 'addon',
    scenarioStepAddon: 'stripe',
  },
  {
    name: 'mailgunBounces',
    scenarioStepKind: 'addon',
    scenarioStepAddon: 'mailgun',
  },
  { name: 'signsIn', scenarioStep: true },
  { name: 'notAStepAtAll' },
] as any

const workflows = {
  trialFlow: {
    name: 'trialFlow',
    scenario: true,
    title: 'The trial runs out',
    steps: [
      { type: 'scenarioStep', stepName: 'signs in', stepFunc: 'signsIn' },
      {
        type: 'scenarioStep',
        stepName: 'expires',
        stepFunc: 'expiresTheTrial',
      },
    ],
  },
  paymentFlow: {
    name: 'paymentFlow',
    scenario: true,
    steps: [
      {
        type: 'branch',
        branches: [
          {
            condition: { type: 'simple', expression: 'x' },
            steps: [
              {
                type: 'scenarioStep',
                stepName: 'webhook',
                stepFunc: 'stripeWebhookArrives',
              },
            ],
          },
        ],
        elseSteps: [
          {
            type: 'parallel',
            children: [
              {
                type: 'scenarioStep',
                stepName: 'expires',
                stepFunc: 'expiresTheTrial',
              },
            ],
          },
        ],
      },
    ],
  },
  fixtureFlow: {
    name: 'fixtureFlow',
    scenario: true,
    tags: ['test-fixture'],
    steps: [
      {
        type: 'scenarioStep',
        stepName: 'expires',
        stepFunc: 'expiresTheTrial',
      },
    ],
  },
  notAScenario: {
    name: 'notAScenario',
    steps: [
      {
        type: 'scenarioStep',
        stepName: 'expires',
        stepFunc: 'expiresTheTrial',
      },
    ],
  },
} as any

const features = {
  trials: { name: 'Trials', entries: [{ scenario: 'trialFlow' }] },
  billing: { name: 'Billing', entries: [{ scenario: 'paymentFlow' }] },
}

describe('toSubjectEntries', () => {
  test('the platform is there whether or not anything declares a step for it', () => {
    const [platform] = toSubjectEntries({
      functions: [],
      workflows: {},
      features: {},
    })
    assert.equal(platform?.kind, 'platform')
    assert.equal(platform?.key, 'platform')
    assert.deepEqual(platform?.steps, [])
  })

  test('the platform collects every step declared for it', () => {
    const [platform] = toSubjectEntries({ functions, workflows, features })
    assert.deepEqual(
      platform?.steps.map((step) => step.name),
      ['expiresTheTrial', 'rebuildsTheIndex']
    )
    assert.equal(platform?.steps[0]?.sourceFile, 'a.ts')
  })

  test('each addon that acts gets a subject of its own', () => {
    const addons = toSubjectEntries({ functions, workflows, features }).filter(
      (subject) => subject.kind === 'addon'
    )
    assert.deepEqual(
      addons.map((addon) => addon.key),
      ['addon:mailgun', 'addon:stripe']
    )
    assert.deepEqual(
      addons.map((addon) => addon.addon),
      ['mailgun', 'stripe']
    )
  })

  test('reach is the scenarios that take one of the subject steps, nested ones included', () => {
    const [platform] = toSubjectEntries({ functions, workflows, features })
    assert.deepEqual(
      platform?.scenarios.map((scenario) => scenario.name),
      ['paymentFlow', 'trialFlow']
    )
    assert.deepEqual(platform?.features, ['Billing', 'Trials'])
  })

  test('a scenario is named by its title where it declares one', () => {
    const [platform] = toSubjectEntries({ functions, workflows, features })
    assert.equal(
      platform?.scenarios.find((s) => s.name === 'trialFlow')?.displayName,
      'The trial runs out'
    )
  })

  test('fixtures and ordinary workflows are not reach', () => {
    const stripe = toSubjectEntries({ functions, workflows, features }).find(
      (subject) => subject.addon === 'stripe'
    )
    assert.deepEqual(
      stripe?.scenarios.map((scenario) => scenario.name),
      ['paymentFlow']
    )
  })
})
