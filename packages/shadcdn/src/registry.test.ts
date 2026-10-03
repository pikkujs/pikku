import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCva } from './cva.js'
import { BLOCKS, COMPONENTS, blockTags, findBlock, findComponent, listBlocks, resolveBlock, resolveComponent } from './index.js'

test('parseCva reads variant groups, options and defaults', () => {
  const parsed = parseCva(`const v = cva('base a:b', { variants: { variant: { default: 'x', 'ghost-2': 'y' }, size: { sm: 'p-1', lg: 'p-2' } }, defaultVariants: { variant: 'default', size: 'sm' } })`)
  assert.deepEqual(parsed, {
    variants: { variant: ['default', 'ghost-2'], size: ['sm', 'lg'] },
    defaultVariants: { variant: 'default', size: 'sm' },
  })
})

test('parseCva ignores braces inside class strings', () => {
  const parsed = parseCva(`cva("[&_svg:not([class*='size-'])]:size-4 { }", { variants: { tone: { a: 'x', b: 'y' } } })`)
  assert.deepEqual(parsed?.variants, { tone: ['a', 'b'] })
})

test('button exposes its variants and sizes from the cva definition', () => {
  const button = findComponent('Button')!
  assert.deepEqual(button.variants.variant, ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'])
  assert.deepEqual(button.variants.size, ['default', 'sm', 'lg', 'icon', 'tile', 'row', 'profile'])
  assert.deepEqual(button.defaultVariants, { variant: 'default', size: 'default', join: 'none' })
})

test('every component ships a story and its dependencies', () => {
  for (const component of COMPONENTS) {
    assert.ok(Object.keys(component.files).some((f) => f.endsWith('.stories.tsx')), `${component.name} has no story`)
  }
})

test('resolveComponent returns the component files and its npm packages', () => {
  const resolved = resolveComponent('button')!
  assert.ok('components/ui/button.tsx' in resolved.files)
  assert.ok(resolved.npmDeps.includes('@radix-ui/react-slot'))
  assert.ok(resolved.npmDeps.includes('class-variance-authority'))
})

test('every block names real components and calls only the keys it ships', () => {
  for (const block of BLOCKS) {
    const keys = new Set(Object.keys(resolveBlock(block.name)!.i18nKeys))
    for (const component of block.components) assert.ok(findComponent(component), `${block.name} → ${component}`)
    for (const content of Object.values(block.source)) {
      for (const [, key] of content.matchAll(/\bm\.([a-z0-9_]+)\(/g)) {
        assert.ok(keys.has(key!), `${block.name} calls m.${key}() without shipping it`)
      }
    }
  }
})

test('listBlocks filters by tag case-insensitively and resolveBlock lists components', () => {
  const tag = blockTags()[0]!
  assert.equal(listBlocks(tag.tag.toUpperCase()).length, tag.count)
  assert.deepEqual(listBlocks('no-such-tag'), [])
  assert.ok(resolveBlock('herobullets')!.components.includes('button'))
  assert.equal(findBlock('nope'), undefined)
})
