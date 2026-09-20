import { z } from 'zod'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  assignPersonaApp,
  nextPort,
  personaAppsInSource,
  personasNamedInSource,
  refuseNewApp,
  retargetClonedPackage,
  validateSlug,
  type AppsConfig,
  type Frontend,
} from '../../utils/app-scaffold.js'

export const PikkuNewAppInput = z.object({
  slug: z.string(),
  serves: z.string().optional(),
  personas: z.string().optional(),
  from: z.string().optional(),
  primary: z.boolean().optional(),
  install: z.boolean().optional(),
})

export const PikkuNewAppOutputSchema = z.object({
  slug: z.string(),
  path: z.string(),
  port: z.number(),
  repaired: z.array(z.string()),
  refusal: z.string().nullable(),
})
export type PikkuNewAppOutput = z.infer<typeof PikkuNewAppOutputSchema>

const CONFIG_FILES = ['pikkufabric.config.json', 'pikku.config.json']

function findConfig(repoDir: string): string | null {
  for (const name of CONFIG_FILES) {
    const path = join(repoDir, name)
    if (existsSync(path)) return path
  }
  return null
}

/**
 * Create a second frontend by cloning the one that already works.
 *
 * A second app exists because someone on the OTHER side of the counter signs
 * in — a supplier, a patient, a franchisee. It is not how two ROLES are
 * served: a role inside an app changes which nav items and which buttons
 * appear, and `/admin` beside the product is a route, not an app. The
 * refusals in `refuseNewApp` are what hold that line, and they are worth more
 * than the scaffolding: the clone is five file edits, while getting the
 * audience wrong is a whole second app nobody needed.
 *
 * This does the portable half only — files in the project, then `install`.
 * Serving the new app (a reverse proxy, a supervisor, a dev runner) belongs
 * to whatever is hosting it.
 */
export const pikkuNewApp = pikkuSessionlessFunc({
  description: 'Create a second frontend by cloning an existing one.',
  input: PikkuNewAppInput,
  output: PikkuNewAppOutputSchema,
  func: async (_services, input) => {
    const repoDir = process.cwd()
    const refuse = (refusal: string): PikkuNewAppOutput => ({
      slug: input.slug,
      path: '',
      port: 0,
      repaired: [],
      refusal,
    })

    const slug = validateSlug(input.slug)
    if (!slug)
      return refuse(
        `"${input.slug}" is not a usable app slug. Use lowercase letters, digits and ` +
          'hyphens, starting with a letter (max 39 chars); "api" is reserved.'
      )

    const serves = input.serves?.trim().toLowerCase()
    if (!serves)
      return refuse(
        'an app must say who it serves: pass --serves <group> naming the people it is ' +
          'for in their own word — staff, customer, supplier, patient.'
      )

    const personas = (input.personas ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (personas.length === 0)
      return refuse(
        'an app needs personas: pass --personas <ids> naming who signs into it. An app ' +
          'is built around who signs into it, so it is not created for people who do ' +
          'not exist yet.'
      )

    const configPath = findConfig(repoDir)
    if (!configPath)
      return refuse(
        `no ${CONFIG_FILES.join(' or ')} in ${repoDir}. This command edits the file that ` +
          'says what apps exist, so it has to be run from the project root.'
      )

    let config: AppsConfig
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as AppsConfig
    } catch (error) {
      return refuse(
        `${configPath} does not parse: ${error instanceof Error ? error.message : String(error)}. ` +
          'Fix the JSON first (a trailing comma or an unquoted key is the usual cause).'
      )
    }

    const frontends: Record<string, Frontend> = config.frontends ?? {}
    const appDir = join(repoDir, 'apps', slug)
    const registered = Boolean(frontends[slug])
    if (existsSync(appDir) && registered)
      return refuse(
        `the "${slug}" app already exists — apps/${slug} is on disk and ${configPath} has ` +
          'it. Build in it; do not create it again.'
      )

    // A half state is this command's OWN wreckage: it writes the directory
    // before the config entry, so a run that dies between the two leaves one
    // without the other. Neither half survives alone — an unregistered
    // directory is a dead copy nothing addresses, an entry with no directory
    // points at nothing — so clear it and carry on rather than refusing and
    // sending the caller to do the surgery by hand.
    const repaired: string[] = []
    if (existsSync(appDir)) {
      rmSync(appDir, { recursive: true, force: true })
      repaired.push(`removed a half-created apps/${slug} left by an earlier attempt`)
    }
    if (registered) {
      delete frontends[slug]
      repaired.push(`replaced a stale "${slug}" frontends entry that pointed at nothing`)
    }

    const refusal = refuseNewApp(
      slug,
      serves,
      personas,
      frontends,
      personaAppsInSource(repoDir)
    )
    if (refusal) return refuse(refusal)

    const declared = personasNamedInSource(repoDir)
    const unknown = declared.size > 0 ? personas.filter((p) => !declared.has(p)) : []
    if (unknown.length > 0)
      return refuse(
        `no definePersonas() call declares: ${unknown.join(', ')}. Add them to the ` +
          'definePersonas({…}) object beside your functions, then run this again.'
      )

    const sourceSlug =
      input.from ??
      Object.entries(frontends).find(([, f]) => f.primary)?.[0] ??
      Object.keys(frontends)[0] ??
      'app'
    const sourceDir = join(repoDir, frontends[sourceSlug]?.cwd ?? `apps/${sourceSlug}`)
    if (!existsSync(sourceDir))
      return refuse(
        `nothing to clone: ${sourceDir} does not exist. Pass --from <slug> naming the ` +
          'app to copy.'
      )

    const isFirstFrontend = Object.keys(frontends).length === 0
    const port = nextPort(frontends)
    const primary = input.primary ?? isFirstFrontend

    assignPersonaApp(repoDir, personas, slug)

    mkdirSync(dirname(appDir), { recursive: true })
    cpSync(sourceDir, appDir, {
      recursive: true,
      // `src/paraglide` is compiled from `messages/` on first run; copying it
      // forward ships one app's compiled strings inside another. node_modules
      // is re-linked by the install below.
      filter: (src) => !/\/(node_modules|src\/paraglide)(\/|$)/.test(src),
    })
    retargetClonedPackage(appDir, slug, port)

    if (primary) for (const entry of Object.values(frontends)) entry.primary = false
    frontends[slug] = {
      cwd: `apps/${slug}`,
      primary,
      deploy: !primary,
      kind: frontends[sourceSlug]?.kind ?? 'ssr',
      dev: { command: ['bun', 'dev'], port, healthPath: '/' },
      serves,
    }
    config.frontends = frontends
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

    if (input.install !== false) {
      spawnSync('bun', ['install'], { cwd: repoDir, stdio: 'inherit' })
    }

    return {
      slug,
      path: `apps/${slug}`,
      port,
      repaired,
      refusal: null,
    }
  },
})

export function renderNewApp(_s: unknown, result: PikkuNewAppOutput): void {
  if (result.refusal) {
    console.log(`\n❌ App not created — ${result.refusal}\n`)
    process.exitCode = 1
    return
  }
  for (const note of result.repaired) console.log(`  (first ${note})`)
  console.log(`\nCreated ${result.path} on port ${result.port}.`)
  console.log('  Its screens are a copy — replace them with what this audience needs.\n')
}
