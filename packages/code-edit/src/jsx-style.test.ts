import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JsxStyleError, writeJsxStyle } from './jsx-props.js'

test('writeJsxStyle adds a className when there is none', () => {
  const out = writeJsxStyle(`const a = <h1 id="x">Hi</h1>`, 1, 10, { fontSize: '30px', padding: '8px 14px' })
  assert.equal(out, `const a = <h1 id="x" className="[font-size:30px]! [padding:8px_14px]!">Hi</h1>`)
})

test('writeJsxStyle replaces its own earlier class for the same property in a literal', () => {
  const src = `const a = <p className="mt-2 [font-size:20px]!">Hi</p>`
  assert.equal(writeJsxStyle(src, 1, 10, { fontSize: '30px' }), `const a = <p className="mt-2 [font-size:30px]!">Hi</p>`)
  assert.equal(writeJsxStyle(src, 1, 10, { fontSize: null }), `const a = <p className="mt-2">Hi</p>`)
})

test('writeJsxStyle appends to cn() and edits that argument on the next save', () => {
  const src = `const a = <Comp className={cn(buttonVariants({ variant, className }))} {...props} />`
  const once = writeJsxStyle(src, 1, 10, { fontSize: '30px' })
  assert.equal(once, `const a = <Comp className={cn(buttonVariants({ variant, className }), "[font-size:30px]!")} {...props} />`)
  const twice = writeJsxStyle(once, 1, 10, { fontSize: '18px', fontWeight: '700' })
  assert.equal(twice, `const a = <Comp className={cn(buttonVariants({ variant, className }), "[font-size:18px]! [font-weight:700]!")} {...props} />`)
  assert.equal(writeJsxStyle(twice, 1, 10, { fontSize: null, fontWeight: null }), src)
})

test('writeJsxStyle refuses classNames it cannot edit safely', () => {
  assert.throws(() => writeJsxStyle(`const a = <p className={styles.x}>Hi</p>`, 1, 10, { color: 'red' }), JsxStyleError)
})

test('writeJsxStyle leaves the source alone when no element starts there', () => {
  const src = `const a = <p>Hi</p>`
  assert.equal(writeJsxStyle(src, 1, 3, { color: 'red' }), src)
})
