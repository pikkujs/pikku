import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCva } from './cva.js'

test('parseCva reads variant groups, options and defaults', () => {
  const parsed = parseCva(
    `const v = cva('base a:b', { variants: { variant: { default: 'x', 'ghost-2': 'y' }, size: { sm: 'p-1', lg: 'p-2' } }, defaultVariants: { variant: 'default', size: 'sm' } })`
  )
  assert.deepEqual(parsed, {
    variants: { variant: ['default', 'ghost-2'], size: ['sm', 'lg'] },
    defaultVariants: { variant: 'default', size: 'sm' },
  })
})

test('parseCva ignores braces inside class strings', () => {
  const parsed = parseCva(
    `cva("[&_svg:not([class*='size-'])]:size-4 { }", { variants: { tone: { a: 'x', b: 'y' } } })`
  )
  assert.deepEqual(parsed?.variants, { tone: ['a', 'b'] })
})
