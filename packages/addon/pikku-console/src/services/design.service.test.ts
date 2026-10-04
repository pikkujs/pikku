import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { DesignService } from './design.service.js'

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-console-design-'))
  await mkdir(join(root, 'packages/theme/themes'), { recursive: true })
  await mkdir(join(root, 'apps/app/src'), { recursive: true })
  await writeFile(
    join(root, 'packages/theme/themes/default.json'),
    JSON.stringify({ name: 'Default', brand: { colors: { primary: '#123456' } }, structure: {} })
  )
  await writeFile(
    join(root, 'apps/app/src/Page.tsx'),
    'export const Page = () => (\n  <Button variant="light" size={3} disabled>\n    Go\n  </Button>\n)\n'
  )
  return root
}

describe('DesignService', () => {
  test('creates, switches and deletes themes, regenerating theme.css', async () => {
    const root = await workspace()
    const design = new DesignService(root)
    assert.strictEqual(await design.createTheme('night', 'Night'), 'night')
    const { themes, activeId } = await design.listThemes()
    assert.deepStrictEqual(themes.map((t) => t.id), ['default', 'night'])
    assert.strictEqual(activeId, 'night')
    const css = await readFile(join(root, 'packages/theme/theme.css'), 'utf-8')
    assert.match(css, /--primary: oklch\(/)
    assert.strictEqual(await design.deleteTheme('night'), 'default')
    await assert.rejects(design.deleteTheme('default'))
    await assert.rejects(design.setActiveTheme('../evil'))
  })

  test('applies a preset with overrides and re-brands the emails', async () => {
    const root = await workspace()
    await mkdir(join(root, 'emails'), { recursive: true })
    await writeFile(join(root, 'emails/theme.json'), JSON.stringify({ appName: 'Keep me' }))
    const design = new DesignService(root)
    const [preset] = design.presets()
    const result = await design.applyTheme({ preset: preset!.id, colors: { primary: '#ff0000' } })
    assert.deepStrictEqual(result, { activeId: preset!.id, emails: true })
    const { spec } = await design.getThemeSpec()
    assert.strictEqual(spec.brand?.colors?.primary, '#ff0000')
    const emails = JSON.parse(await readFile(join(root, 'emails/theme.json'), 'utf-8'))
    assert.strictEqual(emails.appName, 'Keep me')
    assert.strictEqual(emails.colors.button, '#ff0000')
    await assert.rejects(design.applyTheme({ preset: 'nope' }))
  })

  test('merges colours, radius and shadows into the theme and regenerates theme.css', async () => {
    const root = await workspace()
    const design = new DesignService(root)
    await design.updateThemeSpec({
      colors: { accent: '#abcdef' },
      radius: 'lg',
      shadows: { sm: '0 1px 2px #0003' },
    })
    await design.updateThemeSpec({ shadows: { md: '0 2px 4px #0003' }, density: 'roomy' })
    const { spec } = await design.getThemeSpec()
    assert.deepStrictEqual(spec.brand?.colors, { primary: '#123456', accent: '#abcdef' })
    assert.deepStrictEqual(spec.structure, {
      radius: 'lg',
      density: 'roomy',
      shadows: { sm: '0 1px 2px #0003', md: '0 2px 4px #0003' },
    })
    const css = await readFile(join(root, 'packages/theme/theme.css'), 'utf-8')
    assert.match(css, /--radius: 0\.75rem/)
    assert.match(css, /--theme-spacing: 0\.29rem/)
    await assert.rejects(design.updateThemeSpec({ colors: { accent: 'red' } }))
  })

  test('reads and edits literal JSX props at a source location', async () => {
    const root = await workspace()
    const design = new DesignService(root)
    const path = 'apps/app/src/Page.tsx'
    assert.deepStrictEqual(await design.readJsxProps(path, 2, 2), {
      variant: 'light',
      size: 3,
      disabled: true,
    })
    await design.writeJsxProp(path, 2, 2, 'variant', 'filled')
    await design.writeJsxProp(path, 2, 2, 'disabled', null)
    await design.writeJsxProp(path, 2, 2, 'color', 'red')
    const source = await readFile(join(root, path), 'utf-8')
    assert.match(source, /<Button variant="filled" size=\{3\} color="red">/)
    await assert.rejects(design.readJsxProps('../outside.tsx', 1, 0))
  })

  test('serves component meta from the app ui folder and the block library', async () => {
    const root = await workspace()
    await mkdir(join(root, 'apps/app/src/components/ui'), { recursive: true })
    await writeFile(
      join(root, 'apps/app/src/components/ui/button.tsx'),
      "const v = cva('x', { variants: { variant: { default: 'a', brand: 'b' } }, defaultVariants: { variant: 'default' } })"
    )
    const design = new DesignService(root)
    const meta = await design.componentMeta('Button')
    assert.strictEqual(meta.source, 'app')
    assert.deepStrictEqual(meta.variantOptions.variant, ['default', 'brand'])
    assert.deepStrictEqual((await design.uiComponents()).components, ['Button'])
    const { tags, blocks } = await design.listBlocks()
    assert.ok(tags.length > 0 && blocks.length > 0)
    const block = await design.getBlock(blocks[0]!.name)
    assert.ok(Object.keys(block.files).length > 0)
    await assert.rejects(design.getBlock('NoSuchBlock'))
  })
})
