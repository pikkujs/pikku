import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ENV_HEADER = [
  '# Local development only — this file is gitignored and never deployed.',
  '# Deployed stages get their own secrets injected by the platform.',
  '',
].join('\n')

export type Env = Record<string, string | undefined>

/** `KEY=value` lines, with surrounding quotes stripped. Comments and blanks are skipped. */
export const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    out[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return out
}

export const readEnvFile = (path: string): Record<string, string> =>
  existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}

/** Copy `values` into `target`, never replacing a value that is already set. */
export const fillMissing = (
  target: Env,
  values: Record<string, string>
): void => {
  for (const [key, value] of Object.entries(values)) {
    target[key] ??= value
  }
}

/**
 * The environment one frontend child runs with: the process environment, then
 * the frontend's own `.env`, then the root `.env`. Anything already set in the
 * process wins over both files; the frontend's file wins over the root's.
 *
 * Bun loads the working directory's `.env` into the process before this CLI
 * starts, so a process value equal to the root file's is indistinguishable from
 * one the root file put there. Those are treated as the root file's, which is
 * what lets a frontend's own `.env` override them.
 */
export const frontendEnv = (
  base: Env,
  rootEnv: Record<string, string>,
  frontendDir: string
): Env => {
  const env: Env = { ...base }
  for (const [key, value] of Object.entries(rootEnv)) {
    if (env[key] === value) delete env[key]
  }
  fillMissing(env, readEnvFile(`${frontendDir}/.env`))
  fillMissing(env, rootEnv)
  return env
}

export type GeneratedSecret = { name: string; generate: () => string }

/**
 * Secrets that come from the Better Auth scaffold rather than a declaration of
 * their own. Kept next to the generator so the two cannot drift.
 */
export const betterAuthGeneratedSecrets = (
  names: readonly string[]
): GeneratedSecret[] =>
  names.map((name) => ({
    name,
    generate: () => randomBytes(32).toString('base64'),
  }))

/** A declared secret the platform would generate in a deployment, generated here instead. */
export const declaredGeneratedSecrets = (
  definitions: ReadonlyArray<{
    secretId: string
    generate?: { size: number }
  }>
): GeneratedSecret[] =>
  definitions.flatMap((definition) => {
    const size = definition.generate?.size
    return size
      ? [
          {
            name: definition.secretId,
            generate: () => randomBytes(size).toString('hex'),
          },
        ]
      : []
  })

/**
 * Append each secret that `.env` does not already assign, creating the file
 * with its header first. A value already present, in the file or the process
 * environment, is never replaced. Returns the names written.
 */
export const ensureDevSecrets = (
  envPath: string,
  secrets: readonly GeneratedSecret[],
  env: Env = process.env
): string[] => {
  if (secrets.length === 0) return []
  if (!existsSync(envPath)) writeFileSync(envPath, ENV_HEADER)
  let text = readFileSync(envPath, 'utf8')
  if (text.length > 0 && !text.endsWith('\n')) text += '\n'
  const missing = secrets.filter(
    (secret) =>
      !new RegExp(`^\\s*${secret.name}\\s*=`, 'm').test(text) &&
      env[secret.name] === undefined
  )
  if (missing.length === 0) return []
  text += `${missing.map((secret) => `${secret.name}=${secret.generate()}`).join('\n')}\n`
  writeFileSync(envPath, text)
  return missing.map((secret) => secret.name)
}

/**
 * Required secrets nobody has supplied and the CLI cannot make up: declared,
 * not optional, not generated, and absent from both the environment and `.env`.
 */
export const missingRequiredSecrets = (
  definitions: ReadonlyArray<{
    secretId: string
    optional?: boolean
    generate?: unknown
  }>,
  env: Env,
  generated: readonly GeneratedSecret[]
): string[] => {
  const known = new Set(generated.map((secret) => secret.name))
  const names = new Set<string>()
  for (const definition of definitions) {
    if (definition.optional || definition.generate) continue
    if (known.has(definition.secretId)) continue
    if (env[definition.secretId] !== undefined) continue
    names.add(definition.secretId)
  }
  return [...names]
}
