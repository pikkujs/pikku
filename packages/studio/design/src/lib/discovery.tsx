import type { ComponentType } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Convention-based discovery of the user's components. Single source of truth for
// the two globs so the views and the catalog never drift.
//
//   Library → `apps/*/src/components/**/*.stories.tsx`  (Mantine primitives in
//             their variants). Each named export is a variant.
//   App     → `apps/*/src/components/**/*.app.stories.tsx` (app-level widgets
//             composed from the library). Each named export is a NAMED SCENARIO
//             (one per data state) carrying an optional `tag` (e.g.
//             "userQuery: pending"); the default meta lists the widget's
//             query/mutation `inputs`.
//
// Paths are literal and symlink-relative (./workspace → $PIKKU_DESIGN_ROOT);
// Vite follows the symlink and server.fs.allow permits the real target. The story
// shapes mirror the template's `csf.types.ts` but are read structurally at
// runtime — this server never imports the user's types.
// ─────────────────────────────────────────────────────────────────────────────

type ArgType = { description?: string; control?: string | false; defaultValue?: unknown }

type StoryMeta = {
  title: string
  component?: ComponentType<any>
  description?: string
  group?: string
  tags?: string[]
  argTypes?: Record<string, ArgType>
}

type Story = { args?: Record<string, unknown>; render?: ComponentType<any>; name?: string }

export type AppInput = {
  name: string
  kind: 'query' | 'mutation'
  type?: string
  description?: string
}

type AppStoryMeta = StoryMeta & { inputs?: AppInput[] }
type AppStory = Story & { tag?: string }

type StoryModule = { default?: StoryMeta; [key: string]: unknown }

// The library glob also matches `*.app.stories.tsx`, so app files are filtered
// out by path below — they belong to the App lens, not the primitive library.
// The kit lives INSIDE the app (`apps/<app>/src/components/`, imported as
// `@/components/<Name>`) — it is written by the `component-kit` scaffold, not a
// workspace package. Globbing the old `packages/components` left both lenses
// permanently empty because that directory no longer exists in any project.
const libGlob = import.meta.glob<StoryModule>(
  '../../workspace/apps/*/src/components/**/*.stories.tsx',
  { eager: true },
)
const appGlob = import.meta.glob<StoryModule>(
  '../../workspace/apps/*/src/components/**/*.app.stories.tsx',
  { eager: true },
)

const isAppPath = (path: string) => path.includes('.app.stories.')

function storyEntries(mod: StoryModule): [string, Story][] {
  return Object.entries(mod).filter(([key]) => key !== 'default') as [string, Story][]
}

// Group precedence: explicit `group` → first tag → a neutral default. Mirrors the
// design's "Inputs / Data display / Feedback" grouping without forcing it.
function groupOf(meta: StoryMeta): string {
  return meta.group ?? meta.tags?.[0] ?? 'Components'
}

// Which app under `apps/` the file came from. Every project has at least one, and
// a second app is often built built from the same template — so both carry a
// `Header`, a `Card`, a `LoginForm`. Without the app in the identity the two
// collapse into one row that opens whichever was globbed first.
function appOf(path: string): string {
  return path.split('/apps/')[1]?.split('/')[0] ?? ''
}

// The app only earns a place in the group label once there is more than one of
// them — a single-app project should not read as if it were filed by app.
function withAppGroups<T extends { app: string; group: string; key: string }>(items: T[]): T[] {
  const multiApp = new Set(items.map((i) => i.app)).size > 1
  return items
    .map((item) => (multiApp ? { ...item, group: `${item.app} · ${item.group}` } : item))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** An entry matches the id the nav sent: its own key, or — from a console talking
 *  to an older design server that had no keys — its bare title. */
function isSection(item: { key: string; title: string }, section: string): boolean {
  return item.key === section || item.title === section
}

export type LibraryItem = {
  /** Unique across apps (`<app>/<title>`); `title` alone is not. */
  key: string
  app: string
  title: string
  group: string
  tags: string[]
  component?: ComponentType<any>
  argTypes: Record<string, ArgType>
  variants: { name: string; story: Story }[]
}

export const libraryItems: LibraryItem[] = withAppGroups(
  Object.entries(libGlob)
    .filter(([path]) => !isAppPath(path))
    .filter((entry): entry is [string, StoryModule & { default: StoryMeta }] =>
      Boolean(entry[1].default?.title),
    )
    .map(([path, mod]) => ({
      key: `${appOf(path)}/${mod.default.title}`,
      app: appOf(path),
      title: mod.default.title,
      group: groupOf(mod.default),
      tags: mod.default.tags ?? [],
      component: mod.default.component,
      argTypes: mod.default.argTypes ?? {},
      variants: storyEntries(mod).map(([name, story]) => ({ name, story })),
    })),
)

export type AppScenario = {
  name: string
  tag?: string
  story: AppStory
  component?: ComponentType<any>
}

export type AppItem = {
  /** Unique across apps (`<app>/<title>`); `title` alone is not. */
  key: string
  app: string
  title: string
  group: string
  description?: string
  inputs: AppInput[]
  argTypes: Record<string, ArgType>
  scenarios: AppScenario[]
}

export const appItems: AppItem[] = withAppGroups(
  Object.entries(appGlob)
    .filter((entry): entry is [string, StoryModule & { default: AppStoryMeta }] =>
      Boolean(entry[1].default?.title),
    )
    .map(([path, mod]) => {
      const meta = mod.default
      return {
        key: `${appOf(path)}/${meta.title}`,
        app: appOf(path),
        title: meta.title,
        group: groupOf(meta),
        description: meta.description,
        inputs: meta.inputs ?? [],
        argTypes: meta.argTypes ?? {},
        scenarios: storyEntries(mod).map(([name, story]) => ({
          name,
          tag: (story as AppStory).tag,
          story: story as AppStory,
          component: meta.component,
        })),
      }
    }),
)

// ─────────────────────────────────────────────────────────────────────────────
// Artifacts — purely file-driven. Each `artifacts/<slug>-vN.html` in the user's
// repo is one page the design agent drew: self-contained HTML, no build step, no
// module contract. The nav IS the file list — write a file and it shows up.
//
// The options offered on a page are its sections carrying
// `data-artifact-option="<name>"`; `-vN` is a REVISION of the same page, never an
// alternative, so the rows are grouped by slug and `file` is the highest N.
//
// Unlike Library / App above these are NOT globbed. A glob is resolved at
// transform time, so the list is frozen into the module the browser has already
// loaded and a file written afterwards only appears if Vite's HMR websocket
// reaches the client — which, behind the sandbox's Caddy sub-path, it often does
// not. So the list is READ AT RUNTIME from the `artifacts.json` endpoint (see
// vite.config.ts) and the page itself is loaded into an IFRAME. That boundary is
// the other half of the win: a page that does not parse can no longer take the
// shell down with it, so there is no lazy module loader and no render boundary
// around it.
// ─────────────────────────────────────────────────────────────────────────────

export type DesignArtifact = {
  /** The slug (`milestone-2`) — stable across versions, so a link survives one. */
  id: string
  /** The newest version's basename (`milestone-2-v3.html`): what gets opened. */
  file: string
  name: string
  /** Every version on disk, newest first. */
  versions: string[]
  /** The `data-artifact-option` names on `file`, in document order. */
  options: string[]
}

type ArtifactIndex = { dir: string; artifacts: DesignArtifact[] }

/** Read `artifacts/` as it is on disk right now. Throws on a failed request so the
 *  caller can surface it — an empty list means "none", not "couldn't look". */
export async function fetchArtifacts(): Promise<DesignArtifact[]> {
  const url = `${import.meta.env.BASE_URL}artifacts.json`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`artifact index failed (${response.status})`)
  }
  return ((await response.json()) as ArtifactIndex).artifacts
}

/** Where the iframe points. Cache-busted so re-opening after the agent rewrites a
 *  version shows the new bytes rather than the browser's copy. */
export function artifactUrl(file: string): string {
  return `${import.meta.env.BASE_URL}artifact/${encodeURIComponent(file)}?t=${Date.now()}`
}

export type CatalogEntry = { key: string; title: string; group: string; tags: string[] }

/** The console's left menu is built from this — both lenses in one message. */
export function catalog(): { library: CatalogEntry[]; app: CatalogEntry[] } {
  return {
    library: libraryItems.map((i) => ({
      key: i.key,
      title: i.title,
      group: i.group,
      tags: i.tags,
    })),
    app: appItems.map((i) => ({ key: i.key, title: i.title, group: i.group, tags: [] })),
  }
}

export function findLibraryItem(section: string | null): LibraryItem | null {
  return section ? (libraryItems.find((i) => isSection(i, section)) ?? null) : null
}

export function findAppItem(section: string | null): AppItem | null {
  return section ? (appItems.find((i) => isSection(i, section)) ?? null) : null
}

export function sectionItems<T extends { key: string; title: string }>(
  items: T[],
  section: string | null,
): T[] {
  return section ? items.filter((i) => isSection(i, section)) : items
}

/** Render a story/scenario: prefer its own `render`, else the meta component. */
export function renderStory(
  story: Story,
  component: ComponentType<any> | undefined,
): React.ReactNode {
  const Render = story.render ?? component
  if (!Render) return null
  return <Render {...(story.args ?? {})} />
}
