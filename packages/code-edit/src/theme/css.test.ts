import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  contrast,
  hexToLch,
  lchToHex,
  themeContrast,
  themeToCss,
} from './css.js'
import { composeTheme } from './compose.js'
import { ThemeWorkspace } from './theme-workspace.js'
import type { Theme } from './presets.js'

const theme: Theme = {
  name: 'Test',
  brand: {
    colors: { primary: '#2F5D62' },
    fonts: { heading: 'Young Serif', body: 'Literata' },
  },
  structure: { radius: 'lg', density: 'roomy', defaultColorScheme: 'light' },
}

const token = (css: string, block: string, name: string) =>
  css
    .split(`${block} {`)[1]!
    .split('}')[0]!
    .match(new RegExp(`--${name}: (oklch\\([^)]+\\))`))![1]!

const lch = (value: string) => {
  const [l, c, h] = value.match(/[\d.]+/g)!.map(Number) as [
    number,
    number,
    number,
  ]
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
      const ratio = contrast(
        lch(token(css, block, fg)),
        lch(token(css, block, bg))
      )
      assert.ok(ratio >= 4.5, `${block} ${fg} on ${bg} is ${ratio.toFixed(2)}`)
    }
  }
})

test('ThemeWorkspace.apply writes the theme, active id and theme.css', async () => {
  const root = await mkdtemp(join(tmpdir(), 'theme-'))
  const workspace = new ThemeWorkspace(root)
  const { id } = await workspace.apply({
    preset: undefined,
    colors: { primary: '#2F5D62' },
  })
  const css = await readFile(join(workspace.packageDir, 'theme.css'), 'utf-8')
  assert.match(css, /--primary: oklch/)
  assert.equal((await workspace.list()).activeId, id)
})

test('an ink primary turns near white in dark mode instead of mid grey', () => {
  const ink = {
    name: 'Ink',
    brand: { colors: { primary: '#18181b' } },
    structure: {},
  } as Theme
  const dark = themeToCss(ink).split('.dark {')[1]!
  const primary = Number(dark.match(/--primary: oklch\(([\d.]+)/)![1])
  const foreground = Number(
    dark.match(/--primary-foreground: oklch\(([\d.]+)/)![1]
  )
  assert.ok(primary > 0.85, `dark primary ${primary}`)
  assert.ok(foreground < 0.3, `dark primary-foreground ${foreground}`)
})

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

test('default light output is byte-for-byte unchanged', () => {
  assert.equal(
    sha(themeToCss(theme)),
    '1f31cbe616e444e15af1297fd2c9273266d6595dd6774f005d56329a417db7df'
  )
  const paper: Theme = {
    name: 'S',
    brand: { colors: { primary: '#0B6E99' } },
    structure: { page: '#F7F5F0', ink: '#1C2A33' },
  }
  assert.equal(
    sha(themeToCss(paper)),
    'b4d45545c0edd39d70f592ef17774453cc01c9b8ef83387790e718a1b27190d2'
  )
})

// The incident: a dark design applied through the light-only path.
const incident = () =>
  composeTheme({
    preset: 'linear',
    colors: { primary: '#c6ff3d', secondary: '#22262d' },
    page: '#14161a',
    ink: '#eef1f4',
    mode: 'dark',
  }).theme

test('--mode dark derives every token for the dark ground', () => {
  const css = themeToCss(incident())
  for (const block of [':root', '.dark']) {
    for (const [fg, bg, min] of [
      ['foreground', 'background', 7],
      ['card-foreground', 'card', 7],
      ['popover-foreground', 'popover', 7],
      ['muted-foreground', 'background', 4.5],
      ['muted-foreground', 'card', 4.5],
      ['muted-foreground', 'muted', 4.5],
      ['primary-foreground', 'primary', 4.5],
      ['secondary-foreground', 'secondary', 4.5],
      ['accent-foreground', 'accent', 4.5],
      ['input', 'background', 3],
      ['border', 'background', 1.5],
    ] as const) {
      const ratio = contrast(
        lch(token(css, block, fg)),
        lch(token(css, block, bg))
      )
      assert.ok(
        ratio >= min,
        `${block} ${fg} on ${bg} is ${ratio.toFixed(2)}, wanted ${min}`
      )
    }
    for (const name of [
      'foreground',
      'muted-foreground',
      'border',
      'input',
      'primary-foreground',
      'muted',
      'card',
    ]) {
      const { l } = lch(token(css, block, name))
      assert.ok(l > 0 && l < 1, `${block} --${name} lightness is ${l}`)
    }
  }
  assert.equal(
    token(css, ':root', 'background'),
    token(css, '.dark', 'background')
  )
  assert.equal(token(css, ':root', 'ring'), token(css, ':root', 'primary'))
  assert.match(css.split('.dark {')[0]!, /color-scheme: dark;/)
  // primary-foreground on lime is dark, not white
  assert.ok(lch(token(css, ':root', 'primary-foreground')).l < 0.3)
})

test('the contrast report passes for the incident inputs and flags a bad pair', () => {
  const report = themeContrast(incident())
  assert.deepEqual(
    report.map((c) => c.pair),
    [
      'text/page',
      'muted-text/page',
      'primary-foreground/primary',
      'border/page',
      'input/page',
    ]
  )
  assert.ok(
    report.every((c) => c.ok),
    JSON.stringify(report)
  )
  const bad = themeContrast({
    ...theme,
    structure: { page: '#ffffff', ink: '#f0f0f0' },
  })
  assert.ok(bad.some((c) => !c.ok))
})

test('light path never puts white on a light primary', () => {
  const lime: Theme = {
    name: 'L',
    brand: { colors: { primary: '#c6ff3d' } },
    structure: { page: '#14161a', ink: '#eef1f4' },
  }
  const css = themeToCss(lime)
  const ratio = contrast(
    lch(token(css, ':root', 'primary-foreground')),
    lch(token(css, ':root', 'primary'))
  )
  assert.ok(ratio >= 4.5, `primary-foreground on lime is ${ratio.toFixed(2)}`)
})

test('mode dark brands emails from the design, not the preset greys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'theme-'))
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(join(root, 'emails'))
  await writeFile(
    join(root, 'emails', 'theme.json'),
    JSON.stringify({ appName: 'X' })
  )
  await new ThemeWorkspace(root).apply({
    preset: 'linear',
    colors: { primary: '#c6ff3d' },
    page: '#14161a',
    ink: '#eef1f4',
    mode: 'dark',
  })
  const email = JSON.parse(
    await readFile(join(root, 'emails', 'theme.json'), 'utf-8')
  )
  assert.equal(email.appName, 'X')
  assert.equal(email.colors.canvas.toLowerCase(), '#14161a')
  assert.equal(email.colors.button, '#c6ff3d')
  assert.equal(email.colors.buttonText, '#111111')
})
