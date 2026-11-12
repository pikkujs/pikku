import { dirname, relative, resolve, posix } from 'path'
import type { StudioMeta, StudioScreenMeta } from '@pikku/inspector'

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

/** Every field of a screen but its component or app, in declaration order. */
const screenFields = (screen: StudioScreenMeta): string[] => [
  `path: ${JSON.stringify(screen.path)}`,
  `title: ${JSON.stringify(screen.title)}`,
  `scope: ${JSON.stringify(screen.scope)}`,
  ...(screen.nav ? [`nav: ${JSON.stringify(screen.nav)}`] : []),
  ...(screen.replaces !== undefined ? [`replaces: ${screen.replaces}`] : []),
  ...(screen.needsApp !== undefined ? [`needsApp: ${screen.needsApp}`] : []),
  ...(screen.layout ? [`layout: ${JSON.stringify(screen.layout)}`] : []),
  ...(screen.scopes ? [`scopes: ${JSON.stringify(screen.scopes)}`] : []),
  ...(screen.agent !== undefined
    ? [`agent: ${JSON.stringify(screen.agent)}`]
    : []),
  ...(screen.agentTitle !== undefined
    ? [`agentTitle: ${JSON.stringify(screen.agentTitle)}`]
    : []),
  ...(screen.agentDescription !== undefined
    ? [`agentDescription: ${JSON.stringify(screen.agentDescription)}`]
    : []),
  ...(screen.defaultChat !== undefined
    ? [`defaultChat: ${screen.defaultChat}`]
    : []),
]

/**
 * The addon's screens as the host imports them. Each component is a lazy
 * import, so the host's bundler splits it and nothing loads until its route is
 * visited.
 */
export const serializeScreens = (
  manifest: StudioMeta,
  screensFile: string
): string => {
  const entries = manifest.screens.map((screen) => {
    const fields = [
      ...screenFields(screen),
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
  manifest: StudioMeta,
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
  manifest: StudioMeta
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
        ...screenFields(screen),
        screen.component !== undefined
          ? `component: () => import(${JSON.stringify(`${pkg}/${packageSubpath(manifest.file, screen.component)}`)}) as never`
          : `app: ${JSON.stringify(screen.app)}`,
      ]
      return `      { ${fields.join(', ')} },`
    })
    // Widgets load through the package's own `./widgets/*` export, like
    // screens through `./screens/*`. Things and arranged screens are data.
    const widgets = (manifest.widgets ?? []).map(({ component, ...widget }) => {
      const fields = Object.entries(widget).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`
      )
      fields.push(
        `component: () => import(${JSON.stringify(`${pkg}/${packageSubpath(manifest.file, component)}`)}) as never`
      )
      return `      { ${fields.join(', ')} },`
    })
    return [
      '  {',
      `    name: ${JSON.stringify(name)},`,
      `    package: ${JSON.stringify(pkg)},`,
      `    title: ${JSON.stringify(manifest.title)},`,
      '    screens: [',
      ...screens,
      '    ],',
      ...(manifest.widgets ? ['    widgets: [', ...widgets, '    ],'] : []),
      ...(manifest.things
        ? [`    things: ${JSON.stringify(manifest.things)},`]
        : []),
      ...(manifest.arrangedScreens
        ? [`    arrangedScreens: ${JSON.stringify(manifest.arrangedScreens)},`]
        : []),
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

/**
 * `#pikku/screens` for an addon: `definePlugin` typed against the addon's own
 * functions and the message keys of its `messages/en.json`, so a slot's
 * `from`, a thing's `source`, the variants a `copy` words and every message
 * key are checked by tsc. `messageKeys` is undefined when the addon has no
 * catalog; keys are then any string, and the build's PKU358 still checks them.
 */
export const serializePluginTypes = (
  rpcMapImport: string,
  messageKeys: string[] | undefined
): string => {
  const keys =
    messageKeys && messageKeys.length > 0
      ? messageKeys.map((key) => `  | ${JSON.stringify(key)}`).join('\n')
      : '  string'
  return `/**
 * definePlugin, typed against this addon's functions and message keys.
 */
import { definePlugin as untypedDefinePlugin } from '@pikku/core/addon'
import type { DefinePlugin } from '@pikku/core/addon'
import type { RPCMap } from '${rpcMapImport}'

/** Every message key of the addon's messages/en.json. */
export type StudioMessageKey =
${keys}

export const definePlugin = untypedDefinePlugin as DefinePlugin<
  RPCMap,
  StudioMessageKey
>
`
}

/** The message keys of a catalog, leaving out \`$schema\`; undefined when it cannot be read. */
export const catalogMessageKeys = (
  text: string | undefined
): string[] | undefined => {
  if (text === undefined) return undefined
  try {
    const catalog = JSON.parse(text)
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
      return undefined
    }
    return Object.keys(catalog).filter((key) => key !== '$schema')
  } catch {
    return undefined
  }
}
