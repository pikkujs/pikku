import { dirname, relative, resolve, posix } from 'path'
import type { ScreensManifestMeta } from '@pikku/inspector'

const toPosix = (nativePath: string): string => nativePath.replace(/\\/g, '/')

/** `component` is written relative to the file that declared it; the screens file lives elsewhere. */
const componentImport = (
  manifestFile: string,
  screensFile: string,
  specifier: string
): string => {
  const target = resolve(dirname(manifestFile), specifier)
  const path = toPosix(relative(dirname(screensFile), target))
  return path.startsWith('.') ? path : `./${path}`
}

/**
 * The addon's screens as the host imports them. Each component is a lazy
 * import, so the host's bundler splits it and nothing loads until its route is
 * visited.
 */
export const serializeScreens = (
  manifest: ScreensManifestMeta,
  screensFile: string
): string => {
  const entries = manifest.screens.map((screen) => {
    const fields = [
      `path: ${JSON.stringify(screen.path)}`,
      `title: ${JSON.stringify(screen.title)}`,
      ...(screen.nav !== undefined ? [`nav: ${screen.nav}`] : []),
      ...(screen.scopes ? [`scopes: ${JSON.stringify(screen.scopes)}`] : []),
      screen.component !== undefined
        ? `component: () => import(${JSON.stringify(componentImport(manifest.file, screensFile, screen.component))})`
        : `app: ${JSON.stringify(screen.app)}`,
    ]
    return `  { ${fields.join(', ')} },`
  })
  return `export const addonScreens = [\n${entries.join('\n')}\n] as const\n`
}

/**
 * The addon's role: the scopes its own functions require, and nothing it
 * declares by hand, so it cannot drift from what the functions enforce.
 */
export const deriveScreensScopes = (
  functionsMeta: Record<string, { scopes?: string[] }>
): string[] =>
  [
    ...new Set(
      Object.values(functionsMeta).flatMap((meta) => meta.scopes ?? [])
    ),
  ].sort()

/**
 * The manifest a consuming project reads to find an addon's screens and role.
 * `file` is made relative to the package so the published meta does not carry
 * the author's machine path.
 */
export const serializeScreensMeta = (
  manifest: ScreensManifestMeta,
  rootDir: string,
  scopes: string[]
): string =>
  JSON.stringify(
    {
      ...manifest,
      scopes,
      file: posix.normalize(toPosix(relative(rootDir, manifest.file))),
    },
    null,
    2
  )

export type InstalledAddonScreens = {
  name: string
  package: string
  manifest: ScreensManifestMeta
}

/** A component path as the package exports it: relative to `src/`, without the extension. */
const packageSubpath = (file: string, specifier: string): string =>
  posix
    .join(posix.dirname(toPosix(file)), toPosix(specifier))
    .replace(/^src\//, '')
    .replace(/\.[cm]?[jt]sx?$/, '')

/**
 * The host's registry of installed addons that bring screens. Components are
 * lazy imports through the package's own `./screens/*` export, so the host
 * bundler splits them and the screen code never reaches the server bundle.
 */
export const serializeInstalledAddons = (
  addons: InstalledAddonScreens[]
): string => {
  const entries = addons.map(({ name, package: pkg, manifest }) => {
    const screens = manifest.screens.map((screen) => {
      const fields = [
        `path: ${JSON.stringify(screen.path)}`,
        `title: ${JSON.stringify(screen.title)}`,
        ...(screen.nav !== undefined ? [`nav: ${screen.nav}`] : []),
        ...(screen.scopes ? [`scopes: ${JSON.stringify(screen.scopes)}`] : []),
        screen.component !== undefined
          ? `component: () => import(${JSON.stringify(`${pkg}/${packageSubpath(manifest.file, screen.component)}`)}) as never`
          : `app: ${JSON.stringify(screen.app)}`,
      ]
      return `      { ${fields.join(', ')} },`
    })
    return [
      '  {',
      `    name: ${JSON.stringify(name)},`,
      `    title: ${JSON.stringify(manifest.title)},`,
      ...(manifest.icon ? [`    icon: ${JSON.stringify(manifest.icon)},`] : []),
      '    screens: [',
      ...screens,
      '    ],',
      '  },',
    ].join('\n')
  })
  return `export const installedAddons = [\n${entries.join('\n')}\n]\n`
}

/**
 * What the server caps a call to when it names an addon: plain data, no screen
 * imports, so the middleware can load it without pulling in any UI.
 */
export const serializeAddonRoles = (
  addons: InstalledAddonScreens[]
): string => {
  const roles = Object.fromEntries(
    addons.map(({ name, manifest }) => [name, manifest.scopes ?? []])
  )
  return `export const addonRoles: Record<string, readonly string[]> = ${JSON.stringify(roles, null, 2)}\n`
}
