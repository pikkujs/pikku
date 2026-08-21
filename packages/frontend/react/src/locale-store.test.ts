/**
 * Run: node --test packages/frontend/react/src/locale-store.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createLocaleStore } from './locale-store.ts'

const install = (search = '', stored: Record<string, string> = {}): void => {
  const storage = new Map(Object.entries(stored))
  const fake = {
    location: { search },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
    navigator: { language: 'en-GB' },
    document: { documentElement: { lang: '', dir: '' } },
  }
  ;(globalThis as any).window = fake
  ;(globalThis as any).document = fake.document
}

const LOCALES = ['en', 'de', 'ar'] as const

const store = (options: Record<string, unknown> = {}) =>
  createLocaleStore({
    locales: LOCALES,
    defaultLocale: 'en',
    storageKey: 'app.language',
    ...options,
  })

beforeEach(() => {
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete process.env.I18N_DEBUG
})

test('a persisted locale wins over the browser default', () => {
  install('', { 'app.language': 'de' })
  assert.equal(store().getLocale(), 'de')
})

test('an unsupported persisted value falls back rather than being trusted', () => {
  install('', { 'app.language': 'fr' })
  assert.equal(store().getLocale(), 'en')
})

test('the browser language is read when nothing is persisted', () => {
  install()
  assert.equal(store({ locales: ['en', 'de'] as const }).getLocale(), 'en')
})

test('without a window the default locale is used', () => {
  assert.equal(store().getLocale(), 'en')
})

test('setActiveLocale persists the choice and notifies subscribers', () => {
  install()
  const s = store()
  let notified = 0
  s.subscribe(() => notified++)

  s.setActiveLocale('de')

  assert.equal(s.getLocale(), 'de')
  assert.equal(notified, 1)
  assert.equal(
    (globalThis as any).window.localStorage.getItem('app.language'),
    'de'
  )
})

test('setRouteLocale changes the locale without persisting it', () => {
  install()
  const s = store()
  s.setRouteLocale('de')

  assert.equal(s.getLocale(), 'de')
  assert.equal(
    (globalThis as any).window.localStorage.getItem('app.language'),
    null
  )
})

test('an unchanged locale notifies nobody', () => {
  install()
  const s = store()
  let notified = 0
  s.subscribe(() => notified++)

  s.setActiveLocale('en')

  assert.equal(notified, 0)
})

test('unsubscribing stops the notifications', () => {
  install()
  const s = store()
  let notified = 0
  const off = s.subscribe(() => notified++)
  off()

  s.setActiveLocale('de')

  assert.equal(notified, 0)
})

test('the document carries both lang and dir', () => {
  install()
  const s = store()
  s.setActiveLocale('ar')

  const html = (globalThis as any).document.documentElement
  assert.equal(html.lang, 'ar')
  assert.equal(html.dir, 'rtl')
})

test('the document is written before anything renders, not on first change', () => {
  install('', { 'app.language': 'ar' })
  store()

  assert.equal((globalThis as any).document.documentElement.dir, 'rtl')
})

test('direction reads the language subtag, not the whole locale', () => {
  install()
  const s = store()
  assert.equal(s.localeDir('ar-EG'), 'rtl')
  assert.equal(s.localeDir('de-CH'), 'ltr')
})

test('toLocale narrows a route param to a supported locale', () => {
  install()
  const s = store()
  assert.equal(s.toLocale('de'), 'de')
  assert.equal(s.toLocale('klingon'), 'en')
  assert.equal(s.toLocale(null), 'en')
})

test('the paraglide bridge resolves through the store', () => {
  install()
  let bridged: (() => string) | undefined
  const s = store({ overwriteGetLocale: (fn: () => string) => (bridged = fn) })

  s.setActiveLocale('de')

  assert.equal(bridged?.(), 'de')
})

test('debug mode bridges to the mask locale, and only when asked', () => {
  install('?i18n-debug')
  let bridged: (() => string) | undefined
  store({
    debugLocale: 'zz',
    overwriteGetLocale: (fn: () => string) => (bridged = fn),
  })

  assert.equal(bridged?.(), 'zz')
})

test('debug mode without a debug locale changes nothing', () => {
  install('?i18n-debug')
  let bridged: (() => string) | undefined
  store({ overwriteGetLocale: (fn: () => string) => (bridged = fn) })

  assert.equal(bridged?.(), 'en')
})

test('the mask locale stays out of the supported list', () => {
  install('?i18n-debug')
  const s = store({ debugLocale: 'zz' })

  assert.equal(s.getLocale(), 'en')
  assert.equal(s.isI18nDebug(), true)
})

test('i18n-debug=0 turns it off explicitly', () => {
  install('?i18n-debug=0')
  assert.equal(store().isI18nDebug(), false)
})

test('a custom detectInitialLocale replaces the default policy', () => {
  install('', { 'app.language': 'de' })
  const s = store({ detectInitialLocale: () => 'ar' })

  assert.equal(s.getLocale(), 'ar')
})
