/**
 * Where an addon screen shows in Studio's navigation. Leave it out and the
 * screen is routed but not listed.
 */
export type StudioNav = {
  area: 'rail' | 'team' | 'project' | 'account'
  /** The icon's name. */
  icon: string
  order: number
  /** Names a function of the addon that returns a count shown on the entry. */
  badge?: string
}

type StudioScreenBase = {
  /** The route path, under the prefix its `scope` gives it. */
  path: string
  /** A message key in the addon's catalog, `messages/{locale}.json`. It is also the nav label. */
  title: string
  nav?: StudioNav
  /** Takes over the core screen at the same path. Only first-party addons may use it. */
  replaces?: boolean
  /** `'bare'` renders the screen without the shell. */
  layout?: 'bare'
  /** Hides the screen and its nav for viewers without access. The addon's functions must enforce the same scopes: hiding a screen is not access control. */
  scopes?: string[]
  /**
   * The agent that answers in Studio's chat panel while this screen is open.
   * `'studio:<name>'` names an agent Studio ships (e.g. `'studio:knowledge'`);
   * `pikku all` only checks its format. A bare name is an agent the addon ships:
   * it resolves to `agents/<name>.md` in the addon package: the agent's
   * instructions, which name the skills it follows. Its frontmatter has a
   * `title` and a `description`, both message keys in the addon's catalog.
   * Lowercase letters, digits and hyphens, starting with a letter. Leave it out and the chat is unchanged.
   */
  agent?: string
} & (
  | {
      /** `'studio'` gives `/<path>`, `'team'` gives `/<team>/<path>`. */
      scope: 'studio' | 'team'
      needsApp?: never
    }
  | {
      /** `/<team>/<project>[/<target>]/<path>`. */
      scope: 'project'
      /** The screen needs the project's app running. Defaults to `false`. */
      needsApp?: boolean
    }
)

/** A screen rendered by the host from the addon's source. */
export type StudioComponentScreen = StudioScreenBase & {
  component: () => Promise<{ default: unknown }>
}

/** A static program the host serves in a sandboxed iframe. */
export type StudioAppScreen = StudioScreenBase & {
  /** Directory of the built program, relative to the addon package. */
  app: string
}

/** One screen an addon ships: either a component the host renders or a static app it serves in a sandboxed iframe. */
export type StudioScreen = StudioComponentScreen | StudioAppScreen

/** The manifest passed to `definePlugin`: the addon's title, a message key, and its screens. */
export type StudioManifest = {
  title: string
  screens: StudioScreen[]
}

/**
 * Declares the screens and nav an addon brings to Pikku Studio. Read
 * statically by `pikku all`, so every field must be a literal. Titles are
 * message keys in the addon's own catalog, `messages/{locale}.json`: a key
 * missing from `messages/en.json` fails the build.
 */
export const definePlugin = (manifest: StudioManifest) => manifest

/** @deprecated Renamed to `definePlugin`. */
export const pikkuStudio = definePlugin
