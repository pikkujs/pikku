import { existsSync, readFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { findFrontends } from '@pikku/code-edit/brand'
import type { ValidateFinding, ValidateSeverity } from './virtual-user-checks.js'

const PLACEHOLDER_SEVERITY: ValidateSeverity = 'warn'

export const PLACEHOLDER_APP_NAMES = [
  'Pikku Studio Starter',
  'Pikku Starter',
  'Pikku App',
]
export const PLACEHOLDER_TITLE = 'Pikku App'
export const PLACEHOLDER_EMAIL_NAME = 'Pikku Starter'

type BrandApp = { slug: string; dir: string }

export const isPlaceholderName = (name: string, slug: string): boolean =>
  PLACEHOLDER_APP_NAMES.includes(name) ||
  name.toLowerCase() === slug.toLowerCase()

const readJson = (path: string): Record<string, unknown> | null => {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const posix = (path: string) => path.split(sep).join('/')

const brandApps = (dir: string): BrandApp[] => {
  const all = findFrontends(dir)
  return [
    ...all.filter((f) => f.primary),
    ...all.filter((f) => !f.primary),
  ].map((f) => ({ slug: basename(f.dir), dir: f.dir }))
}

export const hasPlaceholderSurface = (dir: string): boolean =>
  brandApps(dir).length > 0 || existsSync(join(dir, 'emails', 'theme.json'))

export const runPlaceholderBrandChecks = (
  workspaceRoot: string,
  apps: BrandApp[] = brandApps(workspaceRoot)
): ValidateFinding[] => {
  const findings: ValidateFinding[] = []
  const add = (
    id: string,
    path: string,
    found: string,
    fixHint: string
  ): void => {
    const where = posix(relative(workspaceRoot, path))
    findings.push({
      id,
      severity: PLACEHOLDER_SEVERITY,
      message: `${where}: still uses the template name "${found}"`,
      path,
      fixHint,
    })
  }
  for (const { slug, dir } of apps) {
    const messages = join(dir, 'messages', 'en.json')
    const appName = readJson(messages)?.['app__name']
    if (typeof appName === 'string' && isPlaceholderName(appName, slug)) {
      add(
        'placeholder-brand-name',
        messages,
        appName,
        "set `app__name` to this app's real name — it is the wordmark in the shell, the phone bar and the auth screens, and a slug is not a brand"
      )
    }
    const meta = join(dir, 'src', 'app-meta.ts')
    const root = existsSync(meta)
      ? meta
      : join(dir, 'src', 'routes', '__root.tsx')
    if (
      existsSync(root) &&
      readFileSync(root, 'utf8').includes(PLACEHOLDER_TITLE)
    ) {
      add(
        'placeholder-brand-title',
        root,
        PLACEHOLDER_TITLE,
        "set the `title`, `og:title` and `og:site_name` meta to the app's real name and its description to what the app does — this is the browser tab and every shared link"
      )
    }
  }
  const theme = join(workspaceRoot, 'emails', 'theme.json')
  if (readJson(theme)?.['appName'] === PLACEHOLDER_EMAIL_NAME) {
    add(
      'placeholder-brand-email',
      theme,
      PLACEHOLDER_EMAIL_NAME,
      "set `appName` to the app's real name — the confirm-address and reset-password emails send from the first signup"
    )
  }
  return findings
}
