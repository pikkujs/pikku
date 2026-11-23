import { createHash } from 'node:crypto'
import {
  existsSync,
  readdirSync,
  type Dirent,
  readFileSync,
  statSync,
} from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import type { AppPage, ReferenceShot } from '@pikku/cli/addon-support/pages'

/**
 * What the page gates judge a clone by, read from a checkout without the CLI's page support: where the
 * capture of the original is, whether it is one, the pages a change touched, and the original's
 * screenshots shown as pages. The gate on `pikku changes done` and the harness's page gate share them.
 */

export const DEFAULT_THRESHOLD = 40
export const MIN_WAIVER_LENGTH = 30
/** A waiver covers only widths under this: a desktop page has no excuse not to match. */
export const WAIVABLE_BELOW = 1000
export const REFERENCES_DIR = join('artifacts', 'references')
/** The archaeology notes of a site being rebuilt (the pikku-site-archaeology skill). */
export const SITE_NOTES = join('knowledge', 'site', 'index.md')

export interface Site {
  name: string
  dir: string
  shots: ReferenceShot[]
  map: Record<string, string>
}

/** Each `artifacts/references/<site>/` holding at least one `<id>-<width>` screenshot. */
export function readSites(
  top: string,
  readReference: (dir: string) => ReferenceShot[]
): Site[] {
  const root = join(top, REFERENCES_DIR)
  if (!existsSync(root)) return []
  const sites: Site[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    if (!statSync(dir).isDirectory()) continue
    let shots: ReferenceShot[]
    try {
      shots = readReference(dir)
    } catch {
      continue
    }
    const mapFile = join(dir, 'map.json')
    let map: Record<string, string> = {}
    try {
      if (existsSync(mapFile)) map = JSON.parse(readFileSync(mapFile, 'utf8'))
    } catch {}
    sites.push({ name, dir, shots, map })
  }
  return sites
}

/**
 * A project rebuilding an existing site: it has a folder under
 * `artifacts/references/` or the archaeology notes `knowledge/site/index.md`.
 */
export function isCloneProject(top: string): boolean {
  if (existsSync(join(top, SITE_NOTES))) return true
  const root = join(top, REFERENCES_DIR)
  try {
    return readdirSync(root).some((name) =>
      statSync(join(root, name)).isDirectory()
    )
  } catch {
    return false
  }
}

/** The original's address: from the capture's `<id>.json` or pages.txt, else the archaeology notes, else the folder name. */
function originalUrl(top: string, site?: string): string {
  const dir = site ? join(top, REFERENCES_DIR, site) : null
  // the site's root: the capture starts from it and finds every page
  const first = (text: string) => {
    const found = text.match(/https?:\/\/[^\s)"'<>\]]+/)?.[0]
    return found ? `${new URL(found).origin}/` : undefined
  }
  if (dir) {
    for (const name of ['index.json', 'pages.txt']) {
      try {
        const found = first(readFileSync(join(dir, name), 'utf8'))
        if (found) return found
      } catch {}
    }
  }
  try {
    const found = first(readFileSync(join(top, SITE_NOTES), 'utf8'))
    if (found) return found
  } catch {}
  return site ? `https://${site}/` : '<url of the original>'
}

/**
 * Why the clone's reference is not one the gate can hold pages to, or null:
 * no screenshots, screenshots without a style.json (not made by the capture),
 * or pictures listed by the capture and none downloaded.
 */
export function referenceProblem(top: string, sites: Site[]): string | null {
  const root = join(top, REFERENCES_DIR)
  if (!sites.length) {
    let folders: string[] = []
    try {
      folders = readdirSync(root).filter((name) =>
        statSync(join(root, name)).isDirectory()
      )
    } catch {}
    const site = folders[0]
    return `There is no capture of the original: ${site ? `${join(REFERENCES_DIR, site)} has` : `${REFERENCES_DIR}/<site> holds`} no <id>-<width>.jpg|png screenshots.\nRun: pikku ui pages capture ${originalUrl(top, site)} --out ${join(REFERENCES_DIR, site ?? '<site>')}`
  }
  for (const site of sites) {
    const out = join(REFERENCES_DIR, site.name)
    const again = `Run: pikku ui pages capture ${originalUrl(top, site.name)} --out ${out}`
    if (!site.shots.some((shot) => shot.style))
      return `${out} was not made by pikku ui pages capture: it has no <id>-<width>.style.json (the original's colours and fonts), so a page cannot be held to the original.\n${again}`
    let listed = false
    for (const name of readdirSync(site.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const doc = JSON.parse(readFileSync(join(site.dir, name), 'utf8'))
        if (doc?.images?.length || doc?.pictures?.length) listed = true
      } catch {}
      if (listed) break
    }
    let downloaded = false
    try {
      downloaded = readdirSync(join(site.dir, 'pictures')).some(
        (name) => name !== 'index.json'
      )
    } catch {}
    if (listed && !downloaded)
      return `The original has pictures, and none were downloaded into ${join(out, 'pictures')}: the clone cannot show them.\n${again}`
  }
  return null
}

/**
 * Pages whose route file was touched. A touched route file that is not a page
 * (a layout, `__root`) touches every page under it: `__root` all of its
 * frontend, `_site.tsx` or `_site/route.tsx` every `_site.*` / `_site/*` page.
 */
export function touchedPages(
  pages: AppPage[],
  workspaceRoot: string,
  touched: string[]
): AppPage[] {
  const hit = new Set<AppPage>()
  const abs = new Set(touched)
  const byApp = new Map<string, AppPage[]>()
  for (const page of pages) {
    const list = byApp.get(page.app) ?? []
    list.push(page)
    byApp.set(page.app, list)
    if (abs.has(resolve(workspaceRoot, page.file))) hit.add(page)
  }
  for (const [app, appPages] of byApp) {
    const routesDir = resolve(workspaceRoot, app, 'src', 'routes')
    const pageFiles = new Set(
      appPages.map((p) => resolve(workspaceRoot, p.file))
    )
    for (const file of abs) {
      if (!file.startsWith(routesDir + sep) || pageFiles.has(file)) continue
      const rel = relative(routesDir, file).split(sep).join('/')
      if (/^__root\./.test(rel)) {
        appPages.forEach((p) => hit.add(p))
        continue
      }
      const stem = rel.replace(/\.[^./]+$/, '').replace(/\/route$/, '')
      for (const page of appPages) {
        const pageRel = relative(routesDir, resolve(workspaceRoot, page.file))
          .split(sep)
          .join('/')
        if (pageRel.startsWith(`${stem}/`) || pageRel.startsWith(`${stem}.`))
          hit.add(page)
      }
    }
  }
  return pages.filter((p) => hit.has(p))
}

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i
const SOURCE_FILE = /\.(tsx?|jsx?|css|scss|html|json|md|mdx|svg)$/i
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.pikku',
  'dist',
  'build',
  '.output',
  '.tanstack',
  'artifacts',
  'tmp',
])

/**
 * The original's screenshots are the answer key, not material: a page that shows its own screenshot scores 0% and is
 * a picture of a page. A change is refused when the app holds a file byte-identical to a reference screenshot (copied
 * and perhaps renamed), or source that names one of the screenshot files.
 */
export function embeddedScreenshots(top: string, sites: Site[]): string[] {
  const shots = sites.flatMap((site) => site.shots.map((shot) => shot.file))
  if (!shots.length) return []
  const sizes = new Map<number, string>()
  const names = new Set<string>()
  const hashes = new Set<string>()
  for (const file of shots) {
    try {
      const bytes = readFileSync(file)
      sizes.set(bytes.length, file)
      hashes.add(createHash('sha256').update(bytes).digest('hex'))
      names.add(basename(file))
    } catch {}
  }
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path, depth + 1)
      } else if (entry.isFile()) {
        const rel = relative(top, path).split(sep).join('/')
        if (IMAGE_FILE.test(entry.name)) {
          let size = -1
          try {
            size = statSync(path).size
          } catch {}
          if (size >= 0 && sizes.has(size)) {
            try {
              if (
                hashes.has(
                  createHash('sha256').update(readFileSync(path)).digest('hex')
                )
              )
                found.push(
                  `${rel} is a copy of the original's screenshot ${basename(sizes.get(size)!)}`
                )
            } catch {}
          }
        } else if (SOURCE_FILE.test(entry.name)) {
          let text = ''
          try {
            if (statSync(path).size < 400_000) text = readFileSync(path, 'utf8')
          } catch {}
          for (const name of names) {
            if (text.includes(name)) {
              found.push(`${rel} uses the original's screenshot ${name}`)
              break
            }
          }
        }
      }
    }
  }
  for (const dir of ['apps', 'packages']) walk(join(top, dir), 0)
  return found
}
