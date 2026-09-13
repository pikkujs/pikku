import { describe, test } from 'node:test'
import assert from 'node:assert'
import { safe, statusColor } from './output.js'

describe('safe', () => {
  test('keeps ordinary text untouched', () => {
    assert.strictEqual(
      safe('Grouped totals — the checkout page'),
      'Grouped totals — the checkout page'
    )
  })

  test('strips the escape that starts a control sequence', () => {
    assert.strictEqual(safe('Totals\x1b[2Joops'), 'Totals[2Joops')
  })

  test('strips an OSC window-title payload', () => {
    assert.strictEqual(safe('ok\x1b]0;owned\x07'), 'ok]0;owned')
  })

  test('keeps newlines and tabs, because bodies are multi-line', () => {
    assert.strictEqual(safe('one\ntwo\tthree'), 'one\ntwo\tthree')
  })

  test('strips the C1 escapes a terminal reads as sequences', () => {
    assert.strictEqual(safe('a\u009b2Kb\u0085c'), 'a2Kbc')
  })
})

describe('statusColor', () => {
  test('neutralizes a status token before colouring it', () => {
    assert.ok(!statusColor('open\x1b[31m').includes('\x1b[31m'))
  })
})
