import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  addonPikkuDir,
  type InstanceOverrides,
} from './derive-instance-overrides.js'

export interface AddonReadiness {
  ready: boolean
  missingSecrets: string[]
  missingVariables: string[]
}

export interface ReadinessProbes {
  secrets: { hasSecret(key: string): Promise<boolean> }
  variables: { has(name: string): Promise<boolean> | boolean }
}

type DeclarationMeta = Record<string, Record<string, string | undefined>>

const readMeta = async (
  pikkuDir: string,
  rel: string
): Promise<DeclarationMeta> => {
  try {
    return JSON.parse(await readFile(join(pikkuDir, rel), 'utf-8'))
  } catch {
    return {}
  }
}

const hasSchemaDefault = async (
  pikkuDir: string,
  schema: string | undefined
): Promise<boolean> => {
  if (!schema) return false
  try {
    const raw = await readFile(
      join(pikkuDir, 'schemas', 'schemas', `${schema}.schema.json`),
      'utf-8'
    )
    return 'default' in JSON.parse(raw)
  } catch {
    return false
  }
}

/**
 * Which of an addon's declared secrets and variables the host cannot resolve
 * yet, under the instance's override names. A variable whose schema carries a
 * default is never missing — the addon boots without it.
 */
export const checkAddonReadiness = async (
  { secrets, variables }: ReadinessProbes,
  rootDir: string,
  packageName: string,
  overrides: InstanceOverrides = {}
): Promise<AddonReadiness> => {
  const pikkuDir = addonPikkuDir(rootDir, packageName)
  if (!pikkuDir) {
    return { ready: true, missingSecrets: [], missingVariables: [] }
  }

  const [secretMeta, variableMeta] = await Promise.all([
    readMeta(pikkuDir, 'secrets/pikku-secrets-meta.gen.json'),
    readMeta(pikkuDir, 'variables/pikku-variables-meta.gen.json'),
  ])

  const missingSecrets: string[] = []
  for (const [key, def] of Object.entries(secretMeta)) {
    const id = def.secretId ?? key
    const name = overrides.secretOverrides?.[id] ?? id
    if (!(await secrets.hasSecret(name))) missingSecrets.push(name)
  }

  const missingVariables: string[] = []
  for (const [key, def] of Object.entries(variableMeta)) {
    const id = def.variableId ?? key
    const name = overrides.variableOverrides?.[id] ?? id
    if (await hasSchemaDefault(pikkuDir, def.schema)) continue
    if (!(await variables.has(name))) missingVariables.push(name)
  }

  return {
    ready: missingSecrets.length === 0 && missingVariables.length === 0,
    missingSecrets,
    missingVariables,
  }
}

const overrideMap = (
  content: string,
  field: keyof InstanceOverrides
): Record<string, string> | undefined => {
  const block = new RegExp(`${field}:\\s*\\{([^}]*)\\}`).exec(content)
  if (!block?.[1]) return undefined
  const map: Record<string, string> = {}
  for (const [, from, to] of block[1].matchAll(
    /['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g
  )) {
    if (from && to) map[from] = to
  }
  return Object.keys(map).length > 0 ? map : undefined
}

/**
 * The override names actually in an instance's `<namespace>.addon.ts`, which
 * the user owns and may have edited away from what the install wrote.
 */
export const readWiringOverrides = async (
  wiringFile: string
): Promise<InstanceOverrides> => {
  const content = await readFile(wiringFile, 'utf-8').catch(() => '')
  return {
    secretOverrides: overrideMap(content, 'secretOverrides'),
    variableOverrides: overrideMap(content, 'variableOverrides'),
    credentialOverrides: overrideMap(content, 'credentialOverrides'),
  }
}
