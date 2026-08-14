#!/usr/bin/env node
// Fails if a Pikku-owned `new WebSocketServer(...)` is constructed without a
// `maxPayload`.
//
// Why: `ws` defaults `maxPayload` to 100MB. A server that omits it lets a
// single unauthenticated upgrade make the process buffer a frame far larger
// than any Pikku message needs — the channel protocol carries JSON control
// frames, not bulk payloads. `@pikku/ws` exports `DEFAULT_WS_MAX_PAYLOAD` (1MB)
// as the ceiling every Pikku-owned server is built with; a server that really
// does need a larger frame has to say so explicitly at its construction site,
// which is exactly the decision we want to be visible in review.
//
// This is a source check rather than a unit test because the requirement is
// "every construction site", including ones that do not exist yet — a test can
// only pin the sites it already knows about.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEARCH_ROOTS = ['packages', 'templates']
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.deploy',
  '.pikku',
  'console-app',
])
const CONSTRUCTOR = 'new WebSocketServer('

/** Recursively collect every .ts/.js source file, skipping build output. */
function findSources(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findSources(full, out)
    // Generated output is not a fixable surface — the authored source it is
    // derived from is scanned (or is markdown) instead.
    else if (
      /\.(ts|mts|js|mjs)$/.test(entry) &&
      !entry.endsWith('.d.ts') &&
      !/\.gen\.(ts|js)$/.test(entry)
    )
      out.push(full)
  }
  return out
}

/**
 * Reads the constructor's argument list by balancing parentheses, so an options
 * object split across lines is inspected in full rather than just its first line.
 */
function readCallArguments(source, openParenIndex) {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    const char = source[i]
    if (char === '(') depth++
    else if (char === ')') {
      depth--
      if (depth === 0) return source.slice(openParenIndex + 1, i)
    }
  }
  return source.slice(openParenIndex + 1)
}

const violations = []
for (const root of SEARCH_ROOTS) {
  for (const file of findSources(join(ROOT, root))) {
    const source = readFileSync(file, 'utf8')
    let from = 0
    for (;;) {
      const at = source.indexOf(CONSTRUCTOR, from)
      if (at === -1) break
      from = at + CONSTRUCTOR.length
      const args = readCallArguments(source, at + CONSTRUCTOR.length - 1)
      if (args.includes('maxPayload')) continue
      const line = source.slice(0, at).split('\n').length
      violations.push(`${file.replace(ROOT + '/', '')}:${line}`)
    }
  }
}

if (violations.length > 0) {
  console.error('\n✖ WebSocketServer constructed without a maxPayload:\n')
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\nPass `maxPayload: DEFAULT_WS_MAX_PAYLOAD` (exported from `@pikku/ws`).' +
      '\nWithout it the server inherits the ws default of 100MB, so one' +
      '\nunauthenticated upgrade can buffer a 100MB frame. If a server genuinely' +
      '\nneeds a larger ceiling, set `maxPayload` to that value explicitly.\n'
  )
  process.exit(1)
}

console.log('✓ every WebSocketServer is constructed with a maxPayload')
