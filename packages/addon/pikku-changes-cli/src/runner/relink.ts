import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { LocalCli } from './types.js'

/** The pikku checkout a CLI build lives in: the nearest folder above `bin` with packages/cli/package.json. */
export const pikkuCheckoutOf = (bin: string): string | undefined => {
  for (let dir = dirname(bin); dirname(dir) !== dir; dir = dirname(dir))
    if (existsSync(join(dir, 'packages', 'cli', 'package.json'))) return dir
  return undefined
}

/** The package a file belongs to: the nearest folder above it with a package.json. */
export const packageOf = (file: string): string => {
  for (
    let dir = dirname(realpathSync(file));
    dirname(dir) !== dir;
    dir = dirname(dir)
  )
    if (existsSync(join(dir, 'package.json'))) return dir
  return file
}

type Manifest = Record<string, Record<string, string> | undefined>

const workspacePackages = (root: string) => {
  const packages = new Map<string, { dir: string; json: Manifest }>()
  const scan = (dir: string, depth: number) => {
    if (depth > 3) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.name === 'node_modules' ||
        entry.name.startsWith('.')
      )
        continue
      const path = join(dir, entry.name)
      try {
        const json = JSON.parse(
          readFileSync(join(path, 'package.json'), 'utf8')
        )
        if (json.name) packages.set(json.name, { dir: path, json })
      } catch {}
      scan(path, depth + 1)
    }
  }
  scan(join(root, 'packages'), 0)
  return packages
}

const link = (from: string, to: string) => {
  rmSync(from, { recursive: true, force: true })
  symlinkSync(to, from)
}

/**
 * Points a checkout's installed @pikku packages at the local build: every
 * copy of a package the CLI needs (@pikku/cli, core, schema-cfworker,
 * addon-graph, `relinkExtra`, and what they depend on) becomes a symlink into
 * the pikku checkout; the project's copies of each `dedupe` dependency point
 * at the one the local @pikku/addon-kysely uses, so TypeScript sees one Kysely; and
 * `.bin/pikku` is the local CLI. Without it a worktree's `pikku` is the
 * published CLI, without the local gates.
 */
export const relinkPikku = (cwd: string, cli: LocalCli): void => {
  const root = cli.checkout
  if (!existsSync(join(root, 'packages')))
    throw new Error(`${root} is not a pikku checkout (no packages/ folder)`)
  const nm = join(cwd, 'node_modules')
  if (!existsSync(nm)) throw new Error(`no node_modules in ${cwd}`)
  const packages = workspacePackages(root)
  const need = new Set<string>()
  const visit = (name: string) => {
    if (need.has(name) || !packages.has(name)) return
    need.add(name)
    const { json } = packages.get(name)!
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
      for (const dep of Object.keys(json[field] ?? {})) visit(dep)
  }
  for (const name of [
    '@pikku/cli',
    '@pikku/core',
    '@pikku/schema-cfworker',
    '@pikku/addon-graph',
    ...(cli.relinkExtra ?? []),
  ])
    visit(name)
  // Every copy at most four levels down (node_modules/@pikku/x, node_modules/<pkg>/node_modules/@pikku/x).
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.name === '@pikku' && entry.isDirectory()) {
        for (const pkg of readdirSync(path))
          if (need.has(`@pikku/${pkg}`))
            link(join(path, pkg), packages.get(`@pikku/${pkg}`)!.dir)
      } else if (entry.isDirectory()) walk(path, depth + 1)
    }
  }
  walk(nm, 1)
  for (const dep of cli.dedupe ?? ['kysely']) {
    const source = join(
      root,
      'packages',
      'services',
      'kysely',
      'node_modules',
      dep
    )
    if (!existsSync(source)) continue
    const real = realpathSync(source)
    // The project's own copy and each workspace package's (packages/<x>, apps/<x>).
    const copies = [
      join(nm, dep),
      ...['packages', 'apps'].flatMap((top) =>
        existsSync(join(cwd, top))
          ? readdirSync(join(cwd, top)).map((name) =>
              join(cwd, top, name, 'node_modules', dep)
            )
          : []
      ),
    ]
    for (const copy of copies)
      if (existsSync(copy) && realpathSync(copy) !== real) link(copy, source)
  }
  if (existsSync(join(nm, '.bin'))) link(join(nm, '.bin', 'pikku'), cli.bin)
}

/**
 * A checkout whose own `node_modules/.bin/pikku` is another CLI than the
 * local build (the published one `bun install` puts there): an agent's
 * `pikku` prefers the project's own, so it would run without the local gates.
 */
export const otherCli = (
  cwd: string,
  cli: LocalCli | undefined
): string | null => {
  const own = join(cwd, 'node_modules', '.bin', 'pikku')
  if (!cli || !existsSync(cli.bin) || !existsSync(own)) return null
  const [mine, wanted] = [packageOf(own), packageOf(cli.bin)]
  return mine === wanted
    ? null
    : `The checkout's own pikku CLI (${mine}) is not the local build's (${wanted}), so an agent's \`pikku\` would run without its gates. Relink @pikku/* to the local build (the default setup does) or fix the setup command.`
}
