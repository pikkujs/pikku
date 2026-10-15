import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as ts from 'typescript'
import { JsxStyleError, writeJsxStyle } from './jsx-props.js'

const assertParses = (source: string) => {
  const { diagnostics = [] } = ts.transpileModule(source, {
    fileName: 'x.tsx',
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  })
  assert.deepEqual(
    diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n')
    ),
    []
  )
}

test('writeJsxStyle adds a className when there is none', () => {
  const out = writeJsxStyle(`const a = <h1 id="x">Hi</h1>`, 1, 10, {
    fontSize: '30px',
    padding: '8px 14px',
  })
  assert.equal(
    out,
    `const a = <h1 id="x" className="[font-size:30px]! [padding:8px_14px]!">Hi</h1>`
  )
})

test('writeJsxStyle replaces its own earlier class for the same property in a literal', () => {
  const src = `const a = <p className="mt-2 [font-size:20px]!">Hi</p>`
  assert.equal(
    writeJsxStyle(src, 1, 10, { fontSize: '30px' }),
    `const a = <p className="mt-2 [font-size:30px]!">Hi</p>`
  )
  assert.equal(
    writeJsxStyle(src, 1, 10, { fontSize: null }),
    `const a = <p className="mt-2">Hi</p>`
  )
})

test('writeJsxStyle appends to cn() and edits that argument on the next save', () => {
  const src = `const a = <Comp className={cn(buttonVariants({ variant, className }))} {...props} />`
  const once = writeJsxStyle(src, 1, 10, { fontSize: '30px' })
  assert.equal(
    once,
    `const a = <Comp className={cn(buttonVariants({ variant, className }), "[font-size:30px]!")} {...props} />`
  )
  const twice = writeJsxStyle(once, 1, 10, {
    fontSize: '18px',
    fontWeight: '700',
  })
  assert.equal(
    twice,
    `const a = <Comp className={cn(buttonVariants({ variant, className }), "[font-size:18px]! [font-weight:700]!")} {...props} />`
  )
  assert.equal(
    writeJsxStyle(twice, 1, 10, { fontSize: null, fontWeight: null }),
    src
  )
})

test('writeJsxStyle refuses classNames it cannot edit safely', () => {
  assert.throws(
    () =>
      writeJsxStyle(`const a = <p className={styles.x}>Hi</p>`, 1, 10, {
        color: 'red',
      }),
    JsxStyleError
  )
})

test('writeJsxStyle leaves the source alone when no element starts there', () => {
  const src = `const a = <p>Hi</p>`
  assert.equal(writeJsxStyle(src, 1, 3, { color: 'red' }), src)
})

test('writeJsxStyle removes the sole style argument of cn() together with its trailing comma', () => {
  const out = writeJsxStyle(
    `const a = <p className={cn("[font-size:30px]!",)}>Hi</p>`,
    1,
    10,
    { fontSize: null }
  )
  assert.equal(out, `const a = <p className={cn()}>Hi</p>`)
  assertParses(out)
})

test('writeJsxStyle removes the sole style argument of a multiline cn() with a trailing comma', () => {
  const src = `const a = (\n  <p\n    className={cn(\n      "[font-size:30px]!",\n    )}\n  >\n    Hi\n  </p>\n)`
  const out = writeJsxStyle(src, 2, 2, { fontSize: null })
  assert.equal(
    out,
    `const a = (\n  <p\n    className={cn(\n    )}\n  >\n    Hi\n  </p>\n)`
  )
  assertParses(out)
})

test('writeJsxStyle removes a style argument after a base class in a cn() with a trailing comma', () => {
  const out = writeJsxStyle(
    `const a = <p className={cn("base", "[font-size:30px]!",)}>Hi</p>`,
    1,
    10,
    { fontSize: null }
  )
  assert.equal(out, `const a = <p className={cn("base",)}>Hi</p>`)
  assertParses(out)
})

test('writeJsxStyle appends to a multiline cn() with a trailing comma', () => {
  const src = `const a = (\n  <p\n    className={cn(\n      "base",\n      className,\n    )}\n  >\n    Hi\n  </p>\n)`
  const once = writeJsxStyle(src, 2, 2, { fontSize: '30px' })
  assert.equal(
    once,
    `const a = (\n  <p\n    className={cn(\n      "base",\n      className, "[font-size:30px]!",\n    )}\n  >\n    Hi\n  </p>\n)`
  )
  assertParses(once)
  assert.equal(writeJsxStyle(once, 2, 2, { fontSize: null }), src)
})

test('writeJsxStyle appends to a cn() without a trailing comma', () => {
  const out = writeJsxStyle(
    `const a = <p className={cn("base", className)}>Hi</p>`,
    1,
    10,
    { fontSize: '30px' }
  )
  assert.equal(
    out,
    `const a = <p className={cn("base", className, "[font-size:30px]!")}>Hi</p>`
  )
  assertParses(out)
})
