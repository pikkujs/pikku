#!/usr/bin/env node
/**
 * Refuse to build a contact sheet from captures that cannot be trusted.
 *
 *   node check-pairs.mjs shots/live/manifest.tsv shots/rebuild/manifest.tsv [--since <path>]
 *
 * A stale shot under a right-looking filename is the one failure a contact sheet
 * structurally cannot show you: it looks like a pass. This is the step that
 * catches the re-shoot that silently never ran.
 *
 * Checks, in order of how often each has actually fired:
 *   - a capture whose landed URL contradicts the route it was shot for (a silent
 *     redirect: signed-in crawls send /, /login and /register all to the dashboard)
 *   - a rebuild capture older than the newest file under --since
 *   - a screen captured on one side and not the other, or at one viewport and not another
 *   - two captures of different routes that produced byte-identical files
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const since = (() => {
  const i = args.indexOf('--since')
  return i === -1 ? null : args[i + 1]
})()
const manifests = args.filter((a) => a !== '--since' && a !== since)
if (!manifests.length) {
  console.error('usage: check-pairs.mjs <manifest.tsv>... [--since <src dir>]')
  process.exit(2)
}

const rows = []
for (const m of manifests) {
  for (const line of readFileSync(m, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [id, viewport, side, route, url, file, iso] = line.split('\t')
    rows.push({ id, viewport, side, route, url, file, iso })
  }
}

// A later row for the same capture supersedes an earlier one, so a partial
// re-shoot appended to the same manifest is read correctly.
const latest = new Map()
for (const r of rows) latest.set(`${r.id}|${r.viewport}|${r.side}`, r)

const problems = []

let newestSource = 0
if (since) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else newestSource = Math.max(newestSource, statSync(p).mtimeMs)
    }
  }
  walk(since)
}

const hashes = new Map()
for (const r of latest.values()) {
  if (!existsSync(r.file)) {
    problems.push(`${r.id}/${r.viewport}/${r.side}: capture file is gone (${r.file})`)
    continue
  }

  // The route as asked for, against the URL the browser ended on. Query strings
  // and trailing slashes are noise; a different path is not.
  const landedPath = (() => {
    try {
      return new URL(r.url).pathname.replace(/\/$/, '')
    } catch {
      return r.url
    }
  })()
  const wanted = r.route.split('?')[0].replace(/\/$/, '')
  if (wanted && wanted !== '/' && landedPath !== wanted) {
    problems.push(`${r.id}/${r.viewport}/${r.side}: asked for ${wanted}, landed on ${landedPath} (redirect?)`)
  }

  if (since && r.side === 'b' && new Date(r.iso).getTime() < newestSource) {
    problems.push(`${r.id}/${r.viewport}/${r.side}: shot ${r.iso}, older than the newest source change`)
  }

  const h = createHash('sha1').update(readFileSync(r.file)).digest('hex')
  const seen = hashes.get(h)
  if (seen && seen.route !== r.route) {
    problems.push(`${r.id}/${r.viewport}/${r.side} is byte-identical to ${seen.id}/${seen.viewport}/${seen.side} on a different route`)
  }
  hashes.set(h, r)
}

// Pairing: every id/viewport wants both sides, and every id wants every viewport
// that any other id has. A viewport quietly skipped on one screen is exactly how
// a mobile pass ends up half-shot.
const viewports = new Set([...latest.values()].map((r) => r.viewport))
const ids = new Set([...latest.values()].map((r) => r.id))
for (const id of ids) {
  for (const vp of viewports) {
    const a = latest.get(`${id}|${vp}|a`)
    const b = latest.get(`${id}|${vp}|b`)
    if (!a && !b) problems.push(`${id}/${vp}: captured on neither side`)
    else if (!a) problems.push(`${id}/${vp}: rebuild only, no live capture`)
    else if (!b) problems.push(`${id}/${vp}: live only, no rebuild capture`)
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nA screen legitimately missing one side belongs in the sheet as a `missing` pane\nwith its reason, not as a capture nobody noticed was absent.')
  process.exit(1)
}
console.log(`${latest.size} captures across ${ids.size} screens x ${viewports.size} viewport(s): pairs check out`)
