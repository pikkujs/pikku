import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contrast, hexToLch, lchToHex, themeToCss } from './css.js'
import { ThemeWorkspace } from './theme-workspace.js'
import type { Theme } from './presets.js'

const theme: Theme = {
  name: 'Test',
  brand: { colors: { primary: '#2F5D62' }, fonts: { heading: 'Young Serif', body: 'Literata' } },
  structure: { radius: 'lg', density: 'roomy', defaultColorScheme: 'light' },
}

const token = (css: string, block: string, name: string) =>
  css.split(`${block} {`)[1]!.split('}')[0]!.match(new RegExp(`--${name}: (oklch\\([^)]+\\))`))![1]!

const lch = (value: string) => {
  const [l, c, h] = value.match(/[\d.]+/g)!.map(Number) as [number, number, number]
  return { l, c, h }
}

test('hex round-trips through OKLCH', () => {
  assert.equal(lchToHex(hexToLch('#2F5D62')).toLowerCase(), '#2f5d62')
})

test('themeToCss emits light and dark blocks and the tailwind mapping', () => {
  const css = themeToCss(theme)
  assert.match(css, /:root \{/)
  assert.match(css, /\.dark \{/)
  assert.match(css, /@custom-variant dark/)
  assert.match(css, /@theme inline \{/)
  assert.match(css, /--color-primary: var\(--primary\);/)
  assert.match(css, /--radius: 0\.75rem;/)
  assert.match(css, /--theme-spacing: 0\.29rem;/)
  assert.match(css, /--theme-font-heading: 'Young Serif', 'Literata'/)
})

test('text tokens clear AA on their surfaces in both schemes', () => {
  const css = themeToCss(theme)
  for (const block of [':root', '.dark']) {
    for (const [fg, bg] of [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['muted-foreground', 'background'],
      ['muted-foreground', 'muted'],
      ['primary-foreground', 'primary'],
    ] as const) {
      const ratio = contrast(lch(token(css, block, fg)), lch(token(css, block, bg)))
      assert.ok(ratio >= 4.5, `${block} ${fg} on ${bg} is ${ratio.toFixed(2)}`)
    }
  }
})

test('ThemeWorkspace.apply writes the theme, active id and theme.css', async () => {
  const root = await mkdtemp(join(tmpdir(), 'theme-'))
  const workspace = new ThemeWorkspace(root)
  const { id } = await workspace.apply({ preset: undefined, colors: { primary: '#2F5D62' } })
  const css = await readFile(join(workspace.packageDir, 'theme.css'), 'utf-8')
  assert.match(css, /--primary: oklch/)
  assert.equal((await workspace.list()).activeId, id)
})

test('an ink primary turns near white in dark mode instead of mid grey', () => {
  const ink = { name: 'Ink', brand: { colors: { primary: '#18181b' } }, structure: {} } as Theme
  const dark = themeToCss(ink).split('.dark {')[1]!
  const primary = Number(dark.match(/--primary: oklch\(([\d.]+)/)![1])
  const foreground = Number(dark.match(/--primary-foreground: oklch\(([\d.]+)/)![1])
  assert.ok(primary > 0.85, `dark primary ${primary}`)
  assert.ok(foreground < 0.3, `dark primary-foreground ${foreground}`)
})
