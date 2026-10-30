#!/usr/bin/env node
/**
 * `pikku inspector parity` on every project under templates/, recipes/ and
 * verifiers/ (nested ones included), so a fix that lands with a verifier is
 * proven for both inspectors.
 *
 *   node scripts/inspector-parity.mjs [--shard <k>/<n>] [--project <dir>]...
 *
 * The --project dirs run as one group.
 *
 * --shard k/n takes every n-th top-level project directory, keeping a
 * verifier's nested projects together. A project that fails only because its
 * codegen does (it needs a database, or is not installed) is skipped when
 * inspector-parity-skip.json says why; an entry for a project that passes is
 * a failure until it is removed, so the list only shrinks.
 *
 * Parity generates into a temporary directory, so it never leaves behind the
 * `.pikku/sdk` an addon calling another through `pikku.uses` is typed from.
 * Each addon another member of its group calls that way is generated for real
 * first, the addons it calls before it.
 *
 * Two things a verifier's projects can need beyond a plain `pikku all`:
 *
 * - An addon the group's other projects opt in to has to be generated before
 *   they are: they read its generated metadata, which a clean tree does not
 *   have, and the parity run restores each project it checks to the state it
 *   found. inspector-parity-addons-first.json lists such addons; each gets a
 *   plain `pikku all` before its group's parity runs, and its output stays.
 * - A project that verifies a build error fails on purpose.
 *   inspector-parity-expected-failures.json names the message, and the
 *   command then requires both engines to fail with it and still agree. A
 *   project that stops failing, or fails otherwise, is a failure.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(REPO, 'packages/cli/dist/bin/pikku.js')
const GROUPS = ['templates', 'recipes', 'verifiers']
const NOT_PROJECTS = new Set([
  'node_modules',
  '.pikku',
  'dist',
  'build',
  '.next',
])

const args = process.argv.slice(2)
const values = (name) =>
  args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []))

const findConfigs = (dir, depth) => {
  const entries = readdirSync(dir, { withFileTypes: true })
  const here = entries.some((e) => e.isFile() && e.name === 'pikku.config.json')
    ? [dir]
    : []
  if (depth === 0) return here
  return [
    ...here,
    ...entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          !NOT_PROJECTS.has(e.name)
      )
      .flatMap((e) => findConfigs(join(dir, e.name), depth - 1)),
  ]
}

const discover = () =>
  GROUPS.flatMap((group) =>
    readdirSync(join(REPO, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => findConfigs(join(REPO, group, entry.name), 2).sort())
      .filter((found) => found.length > 0)
  ).sort((a, b) => a[0].localeCompare(b[0]))

const inShard = (items) => {
  const shard = values('--shard')[0]
  if (!shard) return items
  const [k, n] = shard.split('/').map(Number)
  if (!(n >= 1 && k >= 1 && k <= n)) {
    console.error(`--shard must be k/n with 1 <= k <= n, not ${shard}`)
    process.exit(2)
  }
  return items.filter((_, i) => i % n === k - 1)
}

const groups = values('--project').length
  ? [values('--project').map((p) => resolve(p))]
  : inShard(discover())

const skips = new Map(
  JSON.parse(
    readFileSync(
      new URL('./inspector-parity-skip.json', import.meta.url),
      'utf8'
    )
  ).map(({ project, reason }) => [project, reason])
)

const addonsFirst = new Set(
  JSON.parse(
    readFileSync(
      new URL('./inspector-parity-addons-first.json', import.meta.url),
      'utf8'
    )
  )
)

const expectedFailures = new Map(
  JSON.parse(
    readFileSync(
      new URL('./inspector-parity-expected-failures.json', import.meta.url),
      'utf8'
    )
  ).map(({ project, message }) => [project, message])
)

const generateAddons = (group) => {
  for (const dir of group.filter((dir) =>
    addonsFirst.has(relative(REPO, dir))
  )) {
    const run = spawnSync('node', [CLI, 'all'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    if (run.status !== 0) {
      console.log(
        `\n== ${relative(REPO, dir)}: pikku all failed before the group's parity runs\n` +
          `${run.stdout}\n${run.stderr}`
            .trimEnd()
            .split('\n')
            .slice(-20)
            .join('\n')
            .replace(/^/gm, '   ')
      )
    }
  }
}

const parity = (dir) =>
  spawnSync('node', [CLI, 'inspector', 'parity', ...expectFailureArgs(dir)], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })

const expectFailureArgs = (dir) => {
  const message = expectedFailures.get(relative(REPO, dir))
  return message ? ['--expectFailure', message] : []
}

/** Exit 1 is a difference the command reported; anything else is a failed run. */
const outcome = (run) =>
  run.status === 0
    ? 'agree'
    : run.status === 1 && /The inspectors differ/.test(run.stdout)
      ? 'differ'
      : 'failed'

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** The packages `dir` calls through the `{ alias: 'package@range' }` form of pikku.uses. */
const usesPackages = (dir) => {
  const uses = readJson(join(dir, 'package.json'))?.pikku?.uses
  if (!uses || Array.isArray(uses) || typeof uses !== 'object') return []
  return Object.values(uses)
    .filter((spec) => typeof spec === 'string' && spec.lastIndexOf('@') > 0)
    .map((spec) => spec.slice(0, spec.lastIndexOf('@')))
}

/**
 * Addons in `group` that another member calls through pikku.uses, each after
 * the addons it calls itself.
 */
const addonsToGenerate = (group) => {
  const byName = new Map(
    group.flatMap((dir) => {
      const name = readJson(join(dir, 'package.json'))?.name
      return name ? [[name, dir]] : []
    })
  )
  const ordered = []
  const visit = (name, seen) => {
    if (ordered.includes(name) || seen.has(name)) return
    seen.add(name)
    for (const dep of usesPackages(byName.get(name))) {
      if (byName.has(dep)) visit(dep, seen)
    }
    ordered.push(name)
  }
  const called = group.flatMap(usesPackages).filter((n) => byName.has(n))
  for (const name of [...new Set(called)].sort((a, b) => a.localeCompare(b))) visit(name, new Set())
  return ordered.map((name) => byName.get(name))
}

const generate = (dir) =>
  spawnSync('node', [CLI, 'all'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })

let failures = 0
const summary = { agree: 0, differ: 0, failed: 0, skipped: 0 }
for (const group of groups) {
  for (const dir of addonsToGenerate(group)) {
    const run = generate(dir)
    if (run.status !== 0) {
      console.log(
        `\n== ${relative(REPO, dir)}: pikku all failed before parity\n${`${run.stdout}\n${run.stderr}`.trimEnd().split('\n').slice(-20).join('\n')}`
      )
    }
  }
  generateAddons(group)
  // A consumer generated from its addon fails until the addon has been, so a
  // project that fails is retried once the rest of its group has run.
  const runs = new Map(group.map((dir) => [dir, parity(dir)]))
  for (const [dir, run] of runs) {
    if (outcome(run) === 'failed') runs.set(dir, parity(dir))
  }
  for (const [dir, run] of runs) {
    const project = relative(REPO, dir)
    const result = outcome(run)
    const skip = skips.get(project)
    console.log(`\n== ${project}: ${result}`)
    if (result === 'failed' && skip) {
      console.log(`   skipped: ${skip}`)
      summary.skipped++
      continue
    }
    summary[result]++
    if (result === 'agree' && skip) {
      console.log(
        '   listed in inspector-parity-skip.json but passes: remove the entry'
      )
      failures++
      continue
    }
    if (result === 'agree') continue
    failures++
    const text = `${run.stdout}\n${run.stderr}`
    const from = text.indexOf('The inspectors differ')
    console.log(
      (from >= 0
        ? text.slice(from)
        : text.trimEnd().split('\n').slice(-30).join('\n')
      )
        .trimEnd()
        .replace(/^/gm, '   ')
    )
  }
}

const total = Object.values(summary).reduce((a, b) => a + b, 0)
console.log(
  `\n${total} projects: ${summary.agree} agree, ${summary.differ} differ, ${summary.failed} failed, ${summary.skipped} skipped`
)
if (!existsSync(CLI))
  console.error(`no CLI at ${CLI}: build packages/cli first`)
process.exit(failures > 0 ? 1 : 0)
