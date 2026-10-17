type AddonScreenBase = {
  /** Where the screen mounts under the addon, e.g. `/` or `/:id`. */
  path: string
  title: string
  /** Lists the screen in the host's navigation. */
  nav?: boolean
  /** Required of the viewer to see the screen. The addon's functions must enforce the same scopes: hiding a screen is not access control. */
  scopes?: string[]
}

/** A screen rendered by the host from the addon's source. */
export type AddonComponentScreen = AddonScreenBase & {
  component: () => Promise<{ default: unknown }>
}

/** A static program the host serves in a sandboxed iframe. */
export type AddonAppScreen = AddonScreenBase & {
  /** Directory of the built program, relative to the addon package. */
  app: string
}

/** One screen an addon ships: either a component the host renders or a static app it serves in a sandboxed iframe. */
export type AddonScreen = AddonComponentScreen | AddonAppScreen

/** The manifest passed to `defineScreens`: the addon's title, optional icon and its screens. */
export type ScreensManifest = {
  title: string
  icon?: string
  screens: AddonScreen[]
}

/**
 * Declares the screens an addon ships, which the host mounts when it is wired
 * with `ui: true`. Read statically by `pikku all`, so `path`, `title`, `nav`, `scopes` and `app` must be literals.
 */
export const defineScreens = (manifest: ScreensManifest) => manifest
