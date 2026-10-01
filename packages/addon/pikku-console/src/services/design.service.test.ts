import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { DesignService } from './design.service.js'

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-console-design-'))
  await mkdir(join(root, 'packages/mantine-theme/themes'), { recursive: true })
  await mkdir(join(root, 'apps/app/src'), { recursive: true })
  await writeFile(
    join(root, 'packages/mantine-theme/themes/default.json'),
    JSON.stringify({ name: 'Default', brand: { colors: { primary: '#123456' } }, structure: {} })
  )
  await writeFile(
    join(root, 'apps/app/src/Page.tsx'),
    'export const Page = () => (\n  <Button variant="light" size={3} disabled>\n    Go\n  </Button>\n)\n'
  )
  return root
}

describe('DesignService', () => {
  test('creates, switches and deletes themes, keeping the barrel in step', async () => {
    const root = await workspace()
    const design = new DesignService(root)
    assert.strictEqual(await design.createTheme('night', 'Night'), 'night')
    const { themes, activeId } = await design.listThemes()
    assert.deepStrictEqual(themes.map((t) => t.id), ['default', 'night'])
    assert.strictEqual(activeId, 'night')
    const barrel = await readFile(join(root, 'packages/mantine-theme/themes/index.ts'), 'utf-8')
    assert.match(barrel, /Active theme: night/)
    assert.match(barrel, /'night': t_night/)
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

  test('merges component default props and drops nulls', async () => {
    const design = new DesignService(await workspace())
    await design.updateThemeSpec({
      colors: { accent: '#abcdef' },
      defaultRadius: 'md',
      components: { Button: { defaultProps: { variant: 'filled', size: 'lg' } } },
    })
    await design.updateThemeSpec({ components: { Button: { defaultProps: { size: null } } } })
    const { spec } = await design.getThemeSpec()
    assert.deepStrictEqual(spec.brand?.colors, { primary: '#123456', accent: '#abcdef' })
    assert.deepStrictEqual(spec.structure, {
      defaultRadius: 'md',
      components: { Button: { defaultProps: { variant: 'filled' } } },
    })
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
})
