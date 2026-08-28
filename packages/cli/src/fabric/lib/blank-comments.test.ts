import { describe, test } from 'node:test'
import assert from 'node:assert'
import { blankComments, lineOfOffset } from './blank-comments.js'

describe('blankComments', () => {
  test('blanks a line comment and keeps the line structure', () => {
    const src = ['const a = 1 // trailing', 'const b = 2'].join('\n')
    const out = blankComments(src)
    assert.strictEqual(out.length, src.length)
    assert.strictEqual(out.split('\n').length, 2)
    assert.ok(!out.includes('trailing'))
    assert.ok(out.includes('const a = 1'))
    assert.ok(out.includes('const b = 2'))
  })

  test('blanks a block comment across lines without moving them', () => {
    const src = ['/* one', ' * two', ' */', 'const c = 3'].join('\n')
    const out = blankComments(src)
    assert.strictEqual(out.split('\n').length, 4)
    assert.ok(!out.includes('two'))
    assert.strictEqual(out.split('\n')[3], 'const c = 3')
  })

  test('leaves string contents alone — the specifier lives there', () => {
    const src = `import x from '@scope/pkg'`
    assert.strictEqual(blankComments(src), src)
  })

  test('a // inside a string is not a comment', () => {
    const src = `const url = 'https://example.com/a' // real comment`
    const out = blankComments(src)
    assert.ok(out.includes('https://example.com/a'))
    assert.ok(!out.includes('real comment'))
  })

  test('an escaped quote does not end the string early', () => {
    const src = `const s = 'it\\'s fine' // gone`
    const out = blankComments(src)
    assert.ok(out.includes("it\\'s fine"))
    assert.ok(!out.includes('gone'))
  })

  test('an unterminated block comment blanks to the end', () => {
    const out = blankComments('code\n/* never closed')
    assert.ok(!out.includes('never closed'))
    assert.ok(out.startsWith('code'))
  })
})

describe('lineOfOffset', () => {
  test('is 1-based and counts newlines before the offset', () => {
    const src = 'a\nb\nc'
    assert.strictEqual(lineOfOffset(src, 0), 1)
    assert.strictEqual(lineOfOffset(src, 2), 2)
    assert.strictEqual(lineOfOffset(src, 4), 3)
  })
})
