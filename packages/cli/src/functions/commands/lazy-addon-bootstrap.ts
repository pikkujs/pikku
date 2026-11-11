/**
 * The files of an addon's bootstrap that register its whole surface: every
 * function module and every JSON schema it ships. They are the bulk of what
 * evaluating the bootstrap costs, and none of it is needed until a function
 * runs, so a lazy bootstrap imports them from `loadAddons` instead.
 */
const DEFERRED_ADDON_FILES = new Set([
  'schemas/register.gen.js',
  'function/pikku-functions.gen.js',
])

const SIDE_EFFECT_IMPORT = /^import\s+['"]\.\/([^'"]+)['"]\s*;?\s*$/

export interface SplitAddonBootstrap {
  /** Imported statically, as the addon's own bootstrap would. */
  eager: string[]
  /** Imported from `loadAddons()`, on first use. */
  deferred: string[]
}

/**
 * Splits an addon's generated `pikku-bootstrap.gen.js` into what a consumer
 * imports up front and what it defers, as `<package>/.pikku/<file>` specifiers.
 *
 * Reading the published bootstrap rather than regenerating it is what keeps
 * this working for addons already on npm. Anything other than a plain
 * side-effect import of a sibling file means the shape is not one this knows,
 * and `null` sends the caller back to importing the bootstrap whole.
 */
export const splitAddonBootstrap = (
  packageName: string,
  bootstrapSource: string
): SplitAddonBootstrap | null => {
  const eager: string[] = []
  const deferred: string[] = []
  for (const rawLine of bootstrapSource.split('\n')) {
    const line = rawLine.trim()
    if (
      line === '' ||
      line.startsWith('//') ||
      line.startsWith('/*') ||
      line.startsWith('*')
    ) {
      continue
    }
    const file = SIDE_EFFECT_IMPORT.exec(line)?.[1]
    if (!file) return null
    const specifier = `${packageName}/.pikku/${file}`
    if (DEFERRED_ADDON_FILES.has(file)) {
      deferred.push(specifier)
    } else {
      eager.push(specifier)
    }
  }
  return deferred.length > 0 ? { eager, deferred } : null
}

/**
 * The `loadAddons` export a lazy bootstrap ends with. Always emitted in lazy
 * mode, even with nothing to load, so an entry can await it unconditionally.
 */
export const serializeLoadAddons = (deferred: string[]): string =>
  [
    `let addonsLoaded: Promise<unknown> | undefined`,
    ``,
    `/**`,
    ` * Registers the wired addons' functions and schemas. Awaited by the deploy`,
    ` * entry before it builds services, so a runtime that caps the CPU spent`,
    ` * evaluating a script at startup does not pay for an addon's whole surface.`,
    ` */`,
    `export const loadAddons = (): Promise<unknown> =>`,
    `  (addonsLoaded ??= Promise.all([`,
    ...deferred.map((specifier) => `    import('${specifier}'),`),
    `  ]))`,
    ``,
  ].join('\n')
