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
        virtualUser: 'admin',
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
        virtualUser: 'admin',
      }),
      'Then admin sees an addon in the gallery'
    )
  })
})

describe('composeStepProse with a virtual user role', () => {
  test('the role renders as an apposition after the virtual user', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'signs in',
        virtualUser: 'yasser',
        virtualUserRole: 'founder',
      }),
      'Given yasser (the founder) signs in'
    )
  })

  test('no role renders exactly as it did before', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'signs in',
        virtualUser: 'yasser',
      }),
      'Given yasser signs in'
    )
  })

  test('a role without a virtual user has nothing to qualify, so it is dropped', () => {
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'the receipt totals 4.50',
        virtualUserRole: 'founder',
      }),
      'Then the receipt totals 4.50'
    )
  })

  test('the role sits inside the padded sentence, not the keyword column', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens /app',
        virtualUser: 'nadia',
        virtualUserRole: 'head of ops',
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
        virtualUser: 'nadia',
        continuesPhase: true,
      }),
      'And nadia is invited'
    )
  })

  test('the same virtual user continuing drops the repeated subject', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'sees the audit log',
        virtualUser: 'yasser',
        continuesPhase: true,
        continuesVirtualUser: true,
      }),
      'And sees the audit log'
    )
  })

  test('a new virtual user keeps their name even under And', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'is invited',
        virtualUser: 'nadia',
        continuesPhase: true,
        continuesVirtualUser: false,
      }),
      'And nadia is invited'
    )
  })

  test('the same virtual user across a phase change keeps the subject', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens the dashboard',
        virtualUser: 'yasser',
        continuesVirtualUser: true,
      }),
      'When yasser opens the dashboard'
    )
  })

  test('an introduction is never dropped by a continuation', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'is invited',
        virtualUser: 'nadia',
        virtualUserRole: 'reviewer',
        continuesPhase: true,
      }),
      'And nadia (the reviewer) is invited'
    )
  })
})

describe('composeStepProse basics', () => {
  test('renders the gherkin keyword, the virtual user and the description', () => {
    assert.equal(
      composeStepProse({
        phase: 'given',
        description: 'buys an apple',
        virtualUser: 'shopper',
      }),
      'Given shopper buys an apple'
    )
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'sees a receipt',
        virtualUser: 'shopper',
      }),
      'Then shopper sees a receipt'
    )
  })

  test('a virtual user named after a person reads as that person', () => {
    assert.equal(
      composeStepProse({
        phase: 'when',
        description: 'opens /app',
        virtualUser: 'nadia',
      }),
      'When nadia opens /app'
    )
  })

  test('an anonymous step reads as a plain sentence', () => {
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
        virtualUser: 'admin',
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
      composeStepProse({ ...step, virtualUser: 'shopper', keywordWidth: 5 })
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
