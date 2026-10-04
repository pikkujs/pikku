import { wireAddon, type WireAddonConfig } from './wire-addon.js'

type ExtensionScreenBase = {
  /** Where the screen mounts under the extension, e.g. `/` or `/:id`. */
  path: string
  title: string
  /** Lists the screen in the host's navigation. */
  nav?: boolean
  /** Required of the viewer to see the screen. The extension's functions must enforce the same scopes: hiding a screen is not access control. */
  scopes?: string[]
}

/** A screen rendered by the host from the extension's source. */
export type ExtensionComponentScreen = ExtensionScreenBase & {
  component: () => Promise<{ default: unknown }>
}

/** A static program the host serves in a sandboxed iframe. */
export type ExtensionAppScreen = ExtensionScreenBase & {
  /** Directory of the built program, relative to the extension package. */
  app: string
}

export type ExtensionScreen = ExtensionComponentScreen | ExtensionAppScreen

export type ExtensionManifest = {
  title: string
  icon?: string
  screens: ExtensionScreen[]
}

/**
 * Declares the screens an extension package ships. Read statically by
 * `pikku all`, so `path`, `title`, `nav`, `scopes` and `app` must be literals.
 */
export const defineExtension = (manifest: ExtensionManifest) => manifest

export type WireExtensionConfig = WireAddonConfig

/**
 * Installs an extension into this project: everything `wireAddon` does for its
 * functions, and its screens mount in the host under `/extensions/<name>`.
 * A package that declares no screens is an addon, and `pikku all` rejects it.
 */
export const wireExtension = (config: WireExtensionConfig): void => {
  wireAddon(config)
}
