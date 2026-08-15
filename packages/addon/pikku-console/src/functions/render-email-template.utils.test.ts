import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getNestedValue,
  applyTemplate,
  renderTemplate,
  renderPartial,
} from './render-email-template.utils.js'

describe('getNestedValue', () => {
  test('returns top-level string value', () => {
    assert.equal(getNestedValue({ name: 'Alice' }, 'name'), 'Alice')
  })

  test('returns nested value via dot-path', () => {
    assert.equal(getNestedValue({ user: { age: 30 } }, 'user.age'), '30')
  })

  test('returns empty string for missing key', () => {
    assert.equal(getNestedValue({ a: 1 }, 'b'), '')
  })

  test('returns empty string for mid-path miss', () => {
    assert.equal(getNestedValue({ a: null }, 'a.b'), '')
  })

  test('returns empty string for non-primitive leaf', () => {
    assert.equal(getNestedValue({ a: { b: {} } }, 'a.b'), '')
  })

  test('coerces numbers to string', () => {
    assert.equal(getNestedValue({ count: 42 }, 'count'), '42')
  })
})

describe('applyTemplate', () => {
  test('replaces simple placeholder', () => {
    assert.equal(
      applyTemplate('Hello {{ name }}!', { name: 'Bob' }),
      'Hello Bob!'
    )
  })

  test('replaces {{content}} with context.content string', () => {
    assert.equal(
      applyTemplate('Body: {{ content }}', { content: '<p>Hi</p>' }),
      'Body: <p>Hi</p>'
    )
  })

  test('replaces {{content}} with empty string when not a string', () => {
    assert.equal(applyTemplate('{{ content }}', { content: 123 }), '')
  })

  test('strips partial tags (> prefix)', () => {
    assert.equal(applyTemplate('{{ > header }}', {}), '')
  })

  test('returns empty string for missing placeholder', () => {
    assert.equal(applyTemplate('{{ missing }}', {}), '')
  })

  test('resolves dot-path placeholders', () => {
    assert.equal(
      applyTemplate('{{ user.name }}', { user: { name: 'Carol' } }),
      'Carol'
    )
  })
})

describe('renderTemplate', () => {
  test('resolves single pass', () => {
    assert.equal(renderTemplate('Hi {{ name }}', { name: 'Dave' }), 'Hi Dave')
  })

  test('resolves transitive placeholders up to 5 passes', () => {
    const ctx = { greeting: 'Hi {{ name }}', name: 'Eve' }
    assert.equal(renderTemplate('{{ greeting }}', ctx), 'Hi Eve')
  })

  test('stops early when no more changes', () => {
    assert.equal(renderTemplate('static', {}), 'static')
  })
})

describe('renderPartial', () => {
  test('renders a known partial with context', () => {
    const partials = { header: '<h1>{{ title }}</h1>' }
    assert.equal(
      renderPartial('header', partials, { title: 'Welcome' }),
      '<h1>Welcome</h1>'
    )
  })

  test('returns empty string for unknown partial', () => {
    assert.equal(renderPartial('missing', {}, {}), '')
  })
})
