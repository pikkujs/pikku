import { existsSync, readFileSync } from 'fs'
import { dirname, join, parse } from 'path'
import { parseRemoteAddonPackage } from './remote-addon-sdk.js'

/**
 * One addon an addon calls: the alias its code calls it by
 * (`rpc.invoke('<alias>:<fn>')`) and the package and semver range it was
 * written against.
 */
export type AddonDependency = {
  alias: string
  package: string
  range: string
}

/**
 * What an addon's package.json declares under `pikku.uses`.
 *
 * - `none`: nothing. The wiring's `uses` is not checked against a declaration.
 * - `list`: the older form, a list of names the addon calls. The name is also
 *   the package the wiring must map it to.
 * - `map`: `{ "<alias>": "<package>@<range>" }`. `invalid` holds a message for
 *   each entry that could not be read; those entries are not in `dependencies`.
 *
 * knowledge: decisions/an-addon-declares-the-addons-it-calls.md
 */
export type AddonDependencies =
  | { form: 'none' }
  | { form: 'list'; names: string[] }
  | { form: 'map'; dependencies: AddonDependency[]; invalid: string[] }

/** An alias becomes a namespace prefix and part of a generated type name. */
const ALIAS = /^[A-Za-z][A-Za-z0-9_-]*$/

/** The names a wiring's `uses` may map: the declared aliases, or the listed names. */
export const declaredAddonNames = (declared: AddonDependencies): string[] =>
  declared.form === 'list'
    ? declared.names
    : declared.form === 'map'
      ? declared.dependencies.map((d) => d.alias)
      : []

/** Reads the `pikku.uses` value of an addon's package.json. */
export const parseAddonDependencies = (uses: unknown): AddonDependencies => {
  if (uses === undefined || uses === null) return { form: 'none' }
  if (Array.isArray(uses)) {
    return {
      form: 'list',
      names: uses.filter((u): u is string => typeof u === 'string'),
    }
  }
  if (typeof uses !== 'object') {
    return {
      form: 'map',
      dependencies: [],
      invalid: [
        `pikku.uses must be an object of { "<alias>": "<package>@<range>" }, got ${JSON.stringify(uses)}.`,
      ],
    }
  }
  const dependencies: AddonDependency[] = []
  const invalid: string[] = []
  for (const [alias, spec] of Object.entries(uses as Record<string, unknown>)) {
    if (!ALIAS.test(alias)) {
      invalid.push(
        `pikku.uses names '${alias}', which is not a valid alias. An alias starts with a letter and holds only letters, digits, '-' and '_'.`
      )
      continue
    }
    if (typeof spec !== 'string') {
      invalid.push(
        `pikku.uses.${alias} must be a string '<package>@<range>', got ${JSON.stringify(spec)}.`
      )
      continue
    }
    let parsed: { name: string; range?: string }
    try {
      parsed = parseRemoteAddonPackage(spec)
    } catch (e) {
      invalid.push(
        `pikku.uses.${alias}: ${e instanceof Error ? e.message : String(e)}`
      )
      continue
    }
    if (!parsed.range) {
      invalid.push(
        `pikku.uses.${alias} is '${spec}', which has no version range. Write '${parsed.name}@^1.0.0': the app that wires this addon is checked against it.`
      )
      continue
    }
    dependencies.push({ alias, package: parsed.name, range: parsed.range })
  }
  return { form: 'map', dependencies, invalid }
}

/** The `pikku.uses` an addon's package.json declares. `none` when there is no readable package.json. */
export const readAddonDependencies = (
  packageDir: string
): AddonDependencies => {
  let pkg: any
  try {
    pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'))
  } catch {
    return { form: 'none' }
  }
  return parseAddonDependencies(pkg?.pikku?.uses)
}

/**
 * The directory `packageName` is installed in, looking in `node_modules` from
 * each of `dirs` upwards, as Node's resolution would. Null when it is not
 * installed.
 */
export const findInstalledPackageDir = (
  dirs: string[],
  packageName: string
): string | null => {
  for (const start of dirs) {
    const root = parse(start).root
    let dir = start
    while (dir) {
      const candidate = join(dir, 'node_modules', packageName)
      if (existsSync(join(candidate, 'package.json'))) return candidate
      if (dir === root) break
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}
