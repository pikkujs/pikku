import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { composeStepProse, renderStepTemplate } from './scenario-prose.js'

describe('renderStepTemplate', () => {
  test('substitutes the step input into its placeholders', () => {
    assert.equal(
      renderStepTemplate('sees {packageName}', {
        packageName: '@pikku/addon-stripe',
      }),
      'sees @pikku/addon-stripe'
    )
  })

  test('renders numbers and booleans as words rather than JSON', () => {
    assert.equal(
      renderStepTemplate('sees at least {atLeast} addons, listed {listed}', {
        atLeast: 10,
        listed: true,
      }),
      'sees at least 10 addons, listed true'
    )
  })

  test('an absent optional value leaves no gap in the sentence', () => {
    assert.equal(
      renderStepTemplate('sees {packageName} {state}', {
        packageName: '@pikku/addon-stripe',
      }),
      'sees @pikku/addon-stripe'
    )
  })

  test('a placeholder repeated in the template is substituted each time', () => {
    assert.equal(
      renderStepTemplate('searches {query} and sees {query}', {
        query: 'stripe',
      }),
      'searches stripe and sees stripe'
    )
  })

  test('a non-primitive value is serialised compactly', () => {
    assert.equal(
      renderStepTemplate('sends {payload}', { payload: { a: 1 } }),
      'sends {"a":1}'
    )
  })

  test('no recorded input leaves the template legible rather than half-rendered', () => {
    assert.equal(renderStepTemplate('sees {packageName}', undefined), 'sees')
  })
})

describe('composeStepProse', () => {
  test('renders a template against the step input in place of the description', () => {
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'sees an addon in the gallery',
        template: 'sees {packageName}',
        input: { packageName: '@pikku/addon-todos' },
        actor: 'admin',
      }),
      'Then admin sees @pikku/addon-todos'
    )
  })

  test('falls back to the description when the step declares no template', () => {
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'sees an addon in the gallery',
        input: { packageName: '@pikku/addon-todos' },
        actor: 'admin',
      }),
      'Then admin sees an addon in the gallery'
    )
  })
})

describe('composeStepProse with an actor role', () => {
  test('the role renders as an apposition after the actor', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'signs in',
        actor: 'yasser',
        actorRole: 'founder',
      }),
      'Given yasser (the founder) signs in'
    )
  })

  test('no role renders exactly as it did before', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'signs in',
        actor: 'yasser',
      }),
      'Given yasser signs in'
    )
  })

  test('a role without an actor has nothing to qualify, so it is dropped', () => {
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'the receipt totals 4.50',
        actorRole: 'founder',
      }),
      'Then the receipt totals 4.50'
    )
  })

  test('the role sits inside the padded sentence, not the keyword column', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens /app',
        actor: 'nadia',
        actorRole: 'head of ops',
        keywordWidth: 5,
      }),
      'When  nadia (the head of ops) opens /app'
    )
  })
})

describe('composeStepProse continuations', () => {
  test('a repeated phase reads as And', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'is invited',
        actor: 'nadia',
        continuesPhase: true,
      }),
      'And nadia is invited'
    )
  })

  test('the same actor continuing drops the repeated subject', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'sees the audit log',
        actor: 'yasser',
        continuesPhase: true,
        continuesActor: true,
      }),
      'And sees the audit log'
    )
  })

  test('a new actor keeps their name even under And', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'is invited',
        actor: 'nadia',
        continuesPhase: true,
        continuesActor: false,
      }),
      'And nadia is invited'
    )
  })

  test('the same actor across a phase change keeps the subject', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens the dashboard',
        actor: 'yasser',
        continuesActor: true,
      }),
      'When yasser opens the dashboard'
    )
  })

  test('an introduction is never dropped by a continuation', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'is invited',
        actor: 'nadia',
        actorRole: 'reviewer',
        continuesPhase: true,
      }),
      'And nadia (the reviewer) is invited'
    )
  })
})

describe('composeStepProse basics', () => {
  test('renders the gherkin keyword, the actor and the description', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'buys an apple',
        actor: 'shopper',
      }),
      'Given shopper buys an apple'
    )
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'sees a receipt',
        actor: 'shopper',
      }),
      'Then shopper sees a receipt'
    )
  })

  test('a persona named after a person reads as that person', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens /app',
        actor: 'nadia',
      }),
      'When nadia opens /app'
    )
  })

  test('an actorless step reads as a plain sentence', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'the app data is reset',
      }),
      'Given the app data is reset'
    )
  })

  test('every phase renders its keyword', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'refreshes the dashboard',
        actor: 'admin',
      }),
      'When admin refreshes the dashboard'
    )
  })

  test('a keyword width lines the sentences up under each other', () => {
    const rendered = (
      [
        { phase: 'given', description: 'buys an apple' },
        { phase: 'when', description: 'checks out' },
        { phase: 'then', description: 'sees a receipt' },
      ] as const
    ).map((step) =>
      composeStepProse({ ...step, actor: 'shopper', keywordWidth: 5 })
    )

    assert.deepEqual(rendered, [
      'Given shopper buys an apple',
      'When  shopper checks out',
      'Then  shopper sees a receipt',
    ])
    const columns = new Set(rendered.map((line) => line.indexOf('shopper')))
    assert.equal(columns.size, 1, 'every sentence starts in the same column')
  })

  test('prose degrades to just the description when nothing else is known', () => {
    assert.equal(
      composeStepProse({ phase: 'when', description: 'does the thing' }),
      'When does the thing'
    )
  })
})
