import { dirname, relative, resolve, posix } from 'path'
import type { ExtensionManifestMeta } from '@pikku/inspector'

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
 * The extension's screens as the host imports them. Each component is a lazy
 * import, so the host's bundler splits it and nothing loads until its route is
 * visited.
 */
export const serializeExtensionScreens = (
  manifest: ExtensionManifestMeta,
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
  return `export const extensionScreens = [\n${entries.join('\n')}\n] as const\n`
}

/**
 * The manifest a consuming project reads to tell an extension from an addon.
 * `file` is made relative to the package so the published meta does not carry
 * the author's machine path.
 */
export const serializeExtensionMeta = (
  manifest: ExtensionManifestMeta,
  rootDir: string
): string =>
  JSON.stringify(
    {
      ...manifest,
      file: posix.normalize(toPosix(relative(rootDir, manifest.file))),
    },
    null,
    2
  )
