import { existsSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Names the starter templates ship with. None of them is a product. */
export const PLACEHOLDER_APP_NAMES = ['Fabric Starter', 'Pikku Starter', 'Pikku App']
export const PLACEHOLDER_TITLE = 'Pikku App'
export const PLACEHOLDER_EMAIL_NAME = 'Pikku Starter'

export type PlaceholderBrand = { where: string; found: string; fix: string }

export type BrandApp = { slug: string; dir: string }

/** True when a wordmark is a template's, or just the app's own slug back again. */
export const isPlaceholderName = (name: string, slug: string): boolean =>
  PLACEHOLDER_APP_NAMES.includes(name) || name.toLowerCase() === slug.toLowerCase()

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const posix = (path: string) => path.split(sep).join('/')

/** Every place an app still calls itself by a template's name: the `app__name` wordmark, the tab title, and the emails' sender name. */
export function placeholderBrands(workspaceRoot: string, apps: BrandApp[]): PlaceholderBrand[] {
  const found: PlaceholderBrand[] = []
  for (const { slug, dir } of apps) {
    const messages = readJson(join(dir, 'messages', 'en.json'))
    const appName = typeof messages?.['app__name'] === 'string' ? messages['app__name'] : null
    if (appName !== null && isPlaceholderName(appName, slug)) {
      found.push({
        where: posix(relative(workspaceRoot, join(dir, 'messages', 'en.json'))),
        found: appName,
        fix: "set `app__name` to this app's real name — it is the wordmark in the shell, the phone bar and the auth screens, and a slug is not a brand",
      })
    }
    const meta = join(dir, 'src', 'app-meta.ts')
    const root = existsSync(meta) ? meta : join(dir, 'src', 'routes', '__root.tsx')
    if (existsSync(root) && readFileSync(root, 'utf8').includes(PLACEHOLDER_TITLE)) {
      found.push({
        where: posix(relative(workspaceRoot, root)),
        found: PLACEHOLDER_TITLE,
        fix: "set the `title`, `og:title` and `og:site_name` meta to the app's real name and its description to what the app does — this is the browser tab and every shared link",
      })
    }
  }
  const emails = readJson(join(workspaceRoot, 'emails', 'theme.json'))
  if (emails?.['appName'] === PLACEHOLDER_EMAIL_NAME) {
    found.push({
      where: 'emails/theme.json',
      found: PLACEHOLDER_EMAIL_NAME,
      fix: "set `appName` to the app's real name — the confirm-address and reset-password emails send from the first signup",
    })
  }
  return found
}

/** The product's own name, read off the first app (in the given order) whose wordmark is not a placeholder. */
export function productBrand(apps: BrandApp[]): string | null {
  for (const { slug, dir } of apps) {
    const name = readJson(join(dir, 'messages', 'en.json'))?.['app__name']
    if (typeof name !== 'string' || !name.trim()) continue
    if (isPlaceholderName(name, slug)) continue
    return name
  }
  return null
}
