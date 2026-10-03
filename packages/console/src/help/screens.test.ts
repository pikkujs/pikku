import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  HELP_EXEMPT,
  HELP_PENDING,
  HELP_SCREENS,
  resolveHelpScreen,
} from './screens.js'

const here = dirname(fileURLToPath(import.meta.url))

function routesFromApp(): string[] {
  const src = readFileSync(join(here, '..', 'App.tsx'), 'utf8')
  const found = new Set<string>()
  for (const m of src.matchAll(/<Route\s+path="([^"]+)"/g)) found.add(m[1]!)
  return [...found]
}

test('App.tsx still declares routes we can read', () => {
  const routes = routesFromApp()
  assert.ok(routes.length > 10, `only found ${routes.length} routes`)
  assert.ok(routes.includes('/functions'))
})

test('every route has help, is pending, or is explicitly exempt', () => {
  const pending = new Set(HELP_PENDING)
  const unclassified = routesFromApp().filter(
    (r) => !(r in HELP_SCREENS) && !pending.has(r) && !(r in HELP_EXEMPT)
  )
  assert.deepEqual(
    unclassified,
    [],
    `route(s) with no help entry, no pending marker and no exemption: ${unclassified.join(', ')}. ` +
      `Add copy to HELP_SCREENS, or list it in HELP_PENDING / HELP_EXEMPT with a reason.`
  )
})

test('a route is classified exactly once', () => {
  const pending = new Set(HELP_PENDING)
  for (const route of routesFromApp()) {
    const places = [
      route in HELP_SCREENS && 'HELP_SCREENS',
      pending.has(route) && 'HELP_PENDING',
      route in HELP_EXEMPT && 'HELP_EXEMPT',
    ].filter(Boolean)
    assert.equal(places.length, 1, `${route} is in ${places.join(' and ')}`)
  }
})

test('no classification names a route that no longer exists', () => {
  const routes = new Set(routesFromApp())
  const stale = [
    ...Object.keys(HELP_SCREENS),
    ...HELP_PENDING,
    ...Object.keys(HELP_EXEMPT),
  ].filter((r) => !routes.has(r))
  assert.deepEqual(stale, [], `stale route classification: ${stale.join(', ')}`)
})

test('every written screen fills all four prose slots', () => {
  for (const [route, screen] of Object.entries(HELP_SCREENS)) {
    for (const slot of ['what', 'behaviour', 'surprise', 'examples'] as const) {
      assert.ok(
        String(screen[slot]()).length > 0,
        `${route} has an empty ${slot}`
      )
    }
    assert.ok(
      screen.whatYouCanDo.length > 0,
      `${route} lists nothing under whatYouCanDo`
    )
  }
})

test('resolveHelpScreen matches a host app’s nested mount', () => {
  assert.equal(
    resolveHelpScreen('/acme/projects/site/main/functions'),
    HELP_SCREENS['/functions']
  )
  assert.equal(resolveHelpScreen('/functions/'), HELP_SCREENS['/functions'])
  assert.equal(resolveHelpScreen('/overview'), null)
})
