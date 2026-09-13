import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { consoleNavSections, navItems } from './sections.js'

const sections = consoleNavSections()
const items = sections.flatMap(navItems)

const app = readFileSync(
  fileURLToPath(new URL('../App.tsx', import.meta.url)),
  'utf8'
)

/**
 * Routes that are deliberately not nav destinations: the redirect at the root,
 * the catch-all, the standalone render target, and the pages you arrive at from
 * another screen rather than from the nav.
 */
const NOT_IN_THE_NAV = new Set([
  '/',
  '*',
  '/config',
  '/render/workflow',
  '/agents/playground',
])

const routes = [...app.matchAll(/path="([^"]+)"/g)]
  .map(([, path]) => path)
  .filter((path) => !NOT_IN_THE_NAV.has(path))

describe('the console nav model', () => {
  /* The dock draws a group's items under their group title. An untitled group
     inside a titled section renders as an unlabelled run in the middle of a
     flyout, which reads as the list having lost its place. */
  test('every group inside a section names the question it answers', () => {
    const untitled = sections
      .filter((section) => section.title)
      .flatMap((section) =>
        section.groups
          .filter((group) => !group.title)
          .map((group) => `${section.id}/${group.id}`)
      )
    assert.deepEqual(untitled, [])
  })

  test('the row zone is the only untitled section', () => {
    const untitled = sections.filter((s) => !s.title).map((s) => s.id)
    assert.deepEqual(untitled, ['main'])
  })

  /* One home per destination: a screen listed twice teaches two positions for
     the same thing, which is the habit the dock exists to build. */
  test('no screen is listed in two places', () => {
    const seen = new Map<string, string[]>()
    for (const section of sections) {
      for (const group of section.groups) {
        for (const item of group.items) {
          seen.set(item.href, [
            ...(seen.get(item.href) ?? []),
            `${section.id}/${group.id}`,
          ])
        }
      }
    }
    const duplicated = [...seen]
      .filter(([, homes]) => homes.length > 1)
      .map(([href, homes]) => `${href}: ${homes.join(', ')}`)
    assert.deepEqual(duplicated, [])
  })

  test('every screen the console routes is reachable from the nav', () => {
    const hrefs = new Set(items.map((item) => item.href))
    const unreachable = routes.filter((route) => !hrefs.has(route))
    assert.deepEqual(unreachable, [])
  })

  test('every nav destination is a route that exists', () => {
    const declared = new Set(routes)
    const dangling = items
      .map((item) => item.href)
      .filter((href) => !declared.has(href))
    assert.deepEqual(dangling, [])
  })

  /* The five wiring kinds and three job kinds each own a screen rather than a
     tab, so each is a URL you can land on, link to and bookmark. */
  test('each wiring and job kind has a screen of its own', () => {
    const hrefs = new Set(items.map((item) => item.href))
    for (const href of [
      '/wires/http',
      '/wires/channel',
      '/wires/mcp',
      '/wires/cli',
      '/wires/gateway',
      '/async/scheduler',
      '/async/queue',
      '/async/trigger',
    ]) {
      assert.ok(hrefs.has(href), `${href} has no nav entry`)
    }
    assert.ok(!hrefs.has('/apis'), '/apis is retired')
    assert.ok(!hrefs.has('/jobs'), '/jobs is retired')
  })
})
