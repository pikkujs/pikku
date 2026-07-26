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
      'Then the admin sees @pikku/addon-todos'
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
      'Then the admin sees an addon in the gallery'
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
      'Given the shopper buys an apple'
    )
    assert.equal(
      composeStepProse({
        phase: 'then',
        description: 'sees a receipt',
        actor: 'shopper',
      }),
      'Then the shopper sees a receipt'
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

  test('the neutral `step` phase adds no keyword', () => {
    assert.equal(
      composeStepProse({
        phase: 'step',
        description: 'refreshes the dashboard',
        actor: 'admin',
      }),
      'the admin refreshes the dashboard'
    )
  })

  test('a keyword width lines the sentences up under each other', () => {
    const rendered = (
      [
        { phase: 'given', description: 'buys an apple' },
        { phase: 'when', description: 'checks out' },
        { phase: 'then', description: 'sees a receipt' },
        { phase: 'step', description: 'waits' },
      ] as const
    ).map((step) =>
      composeStepProse({ ...step, actor: 'shopper', keywordWidth: 5 })
    )

    assert.deepEqual(rendered, [
      'Given the shopper buys an apple',
      'When  the shopper checks out',
      'Then  the shopper sees a receipt',
      '      the shopper waits',
    ])
    const columns = new Set(rendered.map((line) => line.indexOf('the shopper')))
    assert.equal(columns.size, 1, 'every sentence starts in the same column')
  })

  test('prose degrades to just the description when nothing else is known', () => {
    assert.equal(
      composeStepProse({ phase: 'step', description: 'does the thing' }),
      'does the thing'
    )
  })
})
