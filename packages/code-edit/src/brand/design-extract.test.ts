import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BrandBrowser } from './browser.js'
import { designProfileToThemeInput, extractFromTokens, extractFromUrl, normaliseSiteUrl, primaryFont } from './design-extract.js'
import { composeTheme } from '../theme/compose.js'

test('DTCG tokens map to roles by name, nested and aliased forms alike', () => {
  const profile = extractFromTokens(
    {
      color: {
        brand: { primary: { $value: '#ff5500', $type: 'color' } },
        accent: { value: '#00aaff' },
        background: { $value: '#fafafa', $type: 'color' },
        text: { $value: '#111111', $type: 'color' },
      },
      font: { heading: { $type: 'fontFamily', $value: ['Clash Display', 'sans-serif'] }, body: { $type: 'fontFamily', $value: '"Inter", sans-serif' } },
    },
    'file:tokens.json'
  )
  assert.equal(profile.colors.primary, '#ff5500')
  assert.equal(profile.colors.accent, '#00aaff')
  assert.equal(profile.colors.secondary, undefined)
  assert.equal(profile.colors.background, '#fafafa')
  assert.equal(profile.colors.text, '#111111')
  assert.deepEqual(profile.fonts, { heading: 'Clash Display', body: 'Inter' })
  assert.deepEqual(profile.notes, [])
})

test('unhinted colours fill the brand roles, never the page or ink', () => {
  const profile = extractFromTokens({ red: { $value: '#ff0000' }, blue: { $value: '#0000ff' }, ink: { $value: '#000000' } }, 'x')
  assert.deepEqual(profile.colors, { primary: '#ff0000', secondary: '#0000ff', text: '#000000' })
})

test('a token file with no colours says so rather than guessing', () => {
  const profile = extractFromTokens({ spacing: { sm: { $value: '4px' } } }, 'file:x')
  assert.deepEqual(profile.colors, {})
  assert.equal(profile.notes.length, 1)
})

test('primaryFont takes the first face, unquoted', () => {
  assert.equal(primaryFont("'Söhne', Helvetica, sans-serif"), 'Söhne')
  assert.equal(primaryFont(undefined), undefined)
})

test('a bare host is read over https and other schemes are refused', () => {
  assert.equal(normaliseSiteUrl('example.com'), 'https://example.com/')
  assert.throws(() => normaliseSiteUrl('ftp://example.com'))
})

test('a scraped page is reduced through the browser and pruned', async () => {
  let asked = ''
  const browser: BrandBrowser = {
    screenshot: async () => new Uint8Array(),
    evaluate: async <T>(url: string) => {
      asked = url
      return {
        colors: { primary: '#123456', surface: undefined },
        fonts: { heading: '"Fraunces", serif', body: 'Inter, sans-serif' },
        structure: { radius: '8px', shadowStrength: 'soft' },
      } as T
    },
    close: async () => {},
  }
  const profile = await extractFromUrl(browser, 'acme.test')
  assert.equal(asked, 'https://acme.test/')
  assert.deepEqual(profile.colors, { primary: '#123456' })
  assert.deepEqual(profile.fonts, { heading: 'Fraunces', body: 'Inter' })
  assert.equal(profile.source, 'url:https://acme.test/')
})

test('a profile feeds composeTheme, dropping colours that are not hex', () => {
  const input = designProfileToThemeInput(
    {
      colors: { primary: '#ff5500', secondary: 'rgb(1, 2, 3)', background: '#fafafa', text: '#111' },
      fonts: { heading: 'Fraunces' },
      structure: {},
      source: 'x',
      notes: [],
    },
    undefined
  )
  assert.deepEqual(input.colors, { primary: '#ff5500', secondary: undefined, accent: undefined })
  const { theme } = composeTheme(input)
  assert.equal(theme.brand.colors.primary, '#ff5500')
  assert.equal(theme.brand.fonts?.heading, 'Fraunces')
  assert.equal(theme.structure.white, '#fafafa')
  assert.equal(theme.structure.black, '#111')
})
