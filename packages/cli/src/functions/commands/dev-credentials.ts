import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KyselyCredentialService } from '@pikku/kysely'
import {
  LocalCredentialService,
  type CredentialService,
  type Logger,
} from '@pikku/core/services'

export const DEV_CREDENTIALS_KEY_ENV = 'PIKKU_DEV_CREDENTIALS_KEY'
const KEY_FILE = 'dev-credentials.key'

/**
 * The key the dev server encrypts stored credentials with. It must outlive the
 * process, or every credential written before a restart becomes unreadable
 * while the session that owns it stays valid.
 */
export const resolveDevCredentialsKey = (
  runtimeDir: string,
  env: NodeJS.ProcessEnv = process.env
): string => {
  const fromEnv = env[DEV_CREDENTIALS_KEY_ENV]?.trim()
  if (fromEnv) return fromEnv

  const file = join(runtimeDir, KEY_FILE)
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim()
    if (stored) return stored
  }
  const key = randomBytes(32).toString('base64')
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(file, `${key}\n`, { encoding: 'utf8', mode: 0o600 })
  return key
}

/**
 * A credential store that survives `pikku dev` restarts when the project has a
 * database with the credential tables, and the in-memory one otherwise.
 */
export const createDevCredentialService = async ({
  kysely,
  runtimeDir,
  logger,
  expectsCredentials,
}: {
  kysely: unknown
  runtimeDir: string
  logger: Logger
  expectsCredentials: boolean
}): Promise<CredentialService> => {
  if (!kysely) return new LocalCredentialService()
  const service = new KyselyCredentialService(kysely as any, {
    key: resolveDevCredentialsKey(runtimeDir),
  })
  try {
    await service.init()
    return service
  } catch (error) {
    if (expectsCredentials) {
      logger.warn(
        `Stored credentials will not survive a restart: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    return new LocalCredentialService()
  }
}
