import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShadcnCatalog } from './shadcn-catalog.js'

const button = `const buttonVariants = cva('x', { variants: { variant: { default: 'a', brand: 'b' }, size: { sm: 'c', lg: 'd' } }, defaultVariants: { variant: 'default', size: 'sm' } })`

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'shadcn-'))
  const ui = join(root, 'apps/app/src/components/ui')
  await mkdir(ui, { recursive: true })
  await writeFile(join(ui, 'button.tsx'), button)
  await writeFile(join(ui, 'button.stories.tsx'), '')
  await writeFile(join(ui, 'dropdown-menu.tsx'), '')
  return root
}

test('componentNames lists the app ui components without stories', async () => {
  const catalog = new ShadcnCatalog(await workspace())
  assert.deepEqual(await catalog.componentNames(), {
    components: ['Button', 'DropdownMenu'],
  })
})

test('componentMeta reads variants and defaults, including a custom one', async () => {
  const catalog = new ShadcnCatalog(await workspace())
  const meta = await catalog.componentMeta('Button')
  assert.deepEqual(meta.variantOptions, {
    variant: ['default', 'brand'],
    size: ['sm', 'lg'],
  })
  assert.deepEqual(meta.defaultVariants, { variant: 'default', size: 'sm' })
})

test('componentMeta is empty for an unknown component or no ui folder', async () => {
  assert.equal(
    (await new ShadcnCatalog(await workspace()).componentMeta('Nope')).source,
    'none'
  )
  const bare = await mkdtemp(join(tmpdir(), 'shadcn-'))
  assert.deepEqual(await new ShadcnCatalog(bare).componentNames(), {
    components: [],
  })
})
