import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  escapeHtml,
  expandPartials,
  getNestedValue,
  renderTemplate,
  substitute,
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

describe('escapeHtml', () => {
  test('escapes the five html-significant characters', () => {
    assert.equal(
      escapeHtml(`<a href="x" title='y'>&</a>`),
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    )
  })
})

describe('substitute', () => {
  test('replaces simple placeholder', () => {
    assert.equal(
      substitute('Hello {{ name }}!', { name: 'Bob' }, false),
      'Hello Bob!'
    )
  })

  test('escapes the value when rendering html', () => {
    assert.equal(
      substitute('<p>{{ name }}</p>', { name: '<b>Bob</b>' }, true),
      '<p>&lt;b&gt;Bob&lt;/b&gt;</p>'
    )
  })

  test('leaves the value raw when rendering plain text', () => {
    assert.equal(
      substitute('{{ name }}', { name: 'Ada & Bob' }, false),
      'Ada & Bob'
    )
  })

  test('renders the triple-brace form raw even in html', () => {
    assert.equal(
      substitute('<p>{{{ name }}}</p>', { name: '<b>Bob</b>' }, true),
      '<p><b>Bob</b></p>'
    )
  })

  test('replaces {{content}} with context.content string, unescaped', () => {
    assert.equal(
      substitute('Body: {{ content }}', { content: '<p>Hi</p>' }, true),
      'Body: <p>Hi</p>'
    )
  })

  test('replaces {{content}} with empty string when not a string', () => {
    assert.equal(substitute('{{ content }}', { content: 123 }, true), '')
  })

  test('strips partial tags (> prefix)', () => {
    assert.equal(substitute('{{ > header }}', {}, true), '')
  })

  test('returns empty string for missing placeholder', () => {
    assert.equal(substitute('{{ missing }}', {}, true), '')
  })

  test('resolves dot-path placeholders', () => {
    assert.equal(
      substitute('{{ user.name }}', { user: { name: 'Carol' } }, true),
      'Carol'
    )
  })

  test('does not rescan the substituted value', () => {
    assert.equal(
      substitute('{{ a }}', { a: '{{ b }}', b: 'leaked' }, false),
      '{{ b }}'
    )
  })
})

describe('expandPartials', () => {
  test('inlines a known partial', () => {
    assert.equal(
      expandPartials('{{> header }}', { header: '<h1>{{ title }}</h1>' }),
      '<h1>{{ title }}</h1>'
    )
  })

  test('inlines nested partials', () => {
    assert.equal(expandPartials('{{> a }}', { a: 'A{{> b }}', b: 'B' }), 'AB')
  })

  test('drops an unknown partial', () => {
    assert.equal(expandPartials('x{{> missing }}y', {}), 'xy')
  })
})

describe('renderTemplate', () => {
  test('resolves a caller variable in one pass', () => {
    assert.equal(
      renderTemplate('Hi {{ name }}', { name: 'Dave' }, {}, false),
      'Hi Dave'
    )
  })

  test('expands a locale string that itself references a caller variable', () => {
    const ctx = { t: { greeting: 'Hi {{ name }}' }, name: 'Eve' }
    assert.equal(renderTemplate('{{ t.greeting }}', ctx, {}, false), 'Hi Eve')
  })

  test('never expands a caller value as a template', () => {
    const ctx = { t: { note: 'secret' }, name: '{{ t.note }}' }
    assert.equal(renderTemplate('{{ name }}', ctx, {}, false), '{{ t.note }}')
  })

  test('escapes a theme value landing in an attribute', () => {
    const ctx = { theme: { fonts: { body: '"Segoe UI", sans-serif' } } }
    assert.equal(
      renderTemplate(
        '<p style="font-family:{{theme.fonts.body}};">',
        ctx,
        {},
        true
      ),
      '<p style="font-family:&quot;Segoe UI&quot;, sans-serif;">'
    )
  })

  test('renders partials before substitution', () => {
    assert.equal(
      renderTemplate(
        '{{> header }}',
        { title: 'Welcome' },
        { header: '<h1>{{ title }}</h1>' },
        true
      ),
      '<h1>Welcome</h1>'
    )
  })

  test('a caller value cannot forge a partial include', () => {
    assert.equal(
      renderTemplate(
        '{{ name }}',
        { name: '{{> header }}' },
        { header: 'LEAKED' },
        false
      ),
      '{{> header }}'
    )
  })

  test('stops early when no more changes', () => {
    assert.equal(renderTemplate('static', {}, {}, true), 'static')
  })
})
