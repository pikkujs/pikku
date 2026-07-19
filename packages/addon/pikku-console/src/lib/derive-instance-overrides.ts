import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Per-instance override derivation for a second-or-later `wireAddon` of the
 * same package. The first instance of a package uses the package's documented
 * logical names as-is (no overrides); once a package is installed a second
 * time, both instances would otherwise resolve to the SAME secret/variable/
 * credential. Namespace-scoping the new instance's names keeps them isolated.
 *
 * Overrides are only a sensible default the console writes into the generated
 * wiring — the user owns the file and can drop or edit them (the runtime and
 * inspector both treat overrides as optional, falling back to the logical name).
 */

export interface AddonDeclaredNames {
  secrets: string[]
  variables: string[]
  credentials: string[]
}

export interface InstanceOverrides {
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

/** `mandrill-promo` -> `MANDRILL_PROMO`. */
const screamingSnake = (s: string): string =>
  s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()

/** `@pikku/addon-mandrill` -> `mandrill`. */
export const packageBase = (packageName: string): string =>
  packageName.replace(/^@[^/]+\//, '').replace(/^addon-/, '')

/**
 * Env-style secret/variable name for an instance. Strips a leading package-base
 * token from the logical key (so `MANDRILL_API_KEY` under `mandrill-promo`
 * becomes `MANDRILL_PROMO_API_KEY`, not `MANDRILL_PROMO_MANDRILL_API_KEY`),
 * otherwise prefixes the whole key.
 */
const scopedEnvName = (namespace: string, base: string, key: string): string => {
  const ns = screamingSnake(namespace)
  const basePrefix = screamingSnake(base) + '_'
  const bare = key.toUpperCase().startsWith(basePrefix)
    ? key.slice(basePrefix.length)
    : key
  return `${ns}_${bare}`
}

/** Credential names are camelCase/kebab identifiers (they double as the
 *  better-auth providerId), so scope them with the kebab namespace rather than
 *  the env-style scream: `gmailOAuth` under `gmail-support` -> `gmail-support-gmailOAuth`. */
const scopedCredentialName = (namespace: string, key: string): string =>
  `${namespace}-${key}`

export function deriveInstanceOverrides(
  namespace: string,
  packageName: string,
  declared: AddonDeclaredNames
): InstanceOverrides {
  const base = packageBase(packageName)
  const overrides: InstanceOverrides = {}

  if (declared.secrets.length > 0) {
    overrides.secretOverrides = Object.fromEntries(
      declared.secrets.map((k) => [k, scopedEnvName(namespace, base, k)])
    )
  }
  if (declared.variables.length > 0) {
    overrides.variableOverrides = Object.fromEntries(
      declared.variables.map((k) => [k, scopedEnvName(namespace, base, k)])
    )
  }
  if (declared.credentials.length > 0) {
    overrides.credentialOverrides = Object.fromEntries(
      declared.credentials.map((k) => [k, scopedCredentialName(namespace, k)])
    )
  }
  return overrides
}

/**
 * Read a freshly-installed addon package's declared logical names from the
 * `.pikku` meta it ships in node_modules. Missing meta files are treated as
 * "declares none" — an addon may have no secrets/variables/credentials.
 */
export async function readAddonDeclaredNames(
  rootDir: string,
  packageName: string
): Promise<AddonDeclaredNames> {
  const pkgPikku = join(rootDir, 'node_modules', packageName, '.pikku')
  // Read the id the addon actually reads by (secretId/variableId for secrets and
  // variables — the string it passes to getSecret / variables.get; the meta's
  // own name for credentials), falling back to the meta key for older meta. That
  // id is what overrides key on, matching the runtime aliaser and the inspector
  // merge.
  const readIds = async (rel: string, idField?: string): Promise<string[]> => {
    try {
      const raw = await readFile(join(pkgPikku, rel), 'utf-8')
      const meta = JSON.parse(raw) as Record<string, Record<string, string>>
      return Object.entries(meta).map(([key, def]) =>
        idField ? (def[idField] ?? key) : key
      )
    } catch {
      // No meta of this kind shipped — the addon declares none.
      return []
    }
  }
  const [secrets, variables, credentials] = await Promise.all([
    readIds('secrets/pikku-secrets-meta.gen.json', 'secretId'),
    readIds('variables/pikku-variables-meta.gen.json', 'variableId'),
    readIds('credentials/pikku-credentials-meta.gen.json'),
  ])
  return { secrets, variables, credentials }
}
