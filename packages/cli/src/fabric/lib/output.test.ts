import { describe, test } from 'node:test'
import assert from 'node:assert'
import { safe, safeBlock, statusColor } from './output.js'

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

  test('takes the newline out, so a title cannot forge a second row', () => {
    assert.strictEqual(
      safe('Grouped totals\n#99  Ship it  chg_forged'),
      'Grouped totals#99  Ship it  chg_forged'
    )
  })

  test('takes the carriage return that would overwrite the line', () => {
    assert.strictEqual(safe('done\rpending'), 'donepending')
  })

  test('takes the tab, which a padded column would misalign around', () => {
    assert.strictEqual(safe('a\tb'), 'ab')
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

describe('safeBlock', () => {
  test('keeps the newlines and tabs a body was written with', () => {
    assert.strictEqual(safeBlock('one\ntwo\tthree'), 'one\ntwo\tthree')
  })

  test('still strips the escape that starts a control sequence', () => {
    assert.strictEqual(safeBlock('Totals\x1b[2Joops'), 'Totals[2Joops')
  })

  test('strips a lone carriage return, which rewrites the printed line', () => {
    assert.strictEqual(safeBlock('done\rpending'), 'donepending')
  })
})
