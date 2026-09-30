import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import {
  reconcileWebhookRegistrations,
  type WebhookRegistrations,
} from '@pikku/core/trigger'

export const WEBHOOK_REGISTRATIONS_FILE = '.webhook-registrations.gen.json'
export const DEV_WEBHOOK_URL_ENV = 'PIKKU_DEV_WEBHOOK_URL'
export const DEV_WEBHOOK_LABEL_PREFIX_ENV = 'PIKKU_DEV_WEBHOOK_LABEL_PREFIX'

/** One developer's label prefix, so two people pointing dev at the same provider account never adopt each other's endpoints. */
export const devWebhookLabelPrefix = (
  env: NodeJS.ProcessEnv = process.env
): string =>
  env[DEV_WEBHOOK_LABEL_PREFIX_ENV]?.trim() || `dev-${userInfo().username}`

/** Without the `GIT_*` a hook exports, which would point every call at the hook's repository instead of `dir`'s. */
export const gitEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  )

const git = (dir: string, args: string[]) =>
  spawnSync('git', args, { cwd: dir, stdio: 'ignore', env: gitEnv() }).status

/**
 * The file holds signing secrets, so it must never be committed: refuse when
 * it already is, and ignore it otherwise. Outside a git repository there is
 * nothing to guard.
 */
const guardFromGit = (dir: string): string | undefined => {
  if (
    git(dir, ['ls-files', '--error-unmatch', WEBHOOK_REGISTRATIONS_FILE]) === 0
  ) {
    return `${WEBHOOK_REGISTRATIONS_FILE} is tracked by git and holds signing secrets. Untrack it (git rm --cached ${WEBHOOK_REGISTRATIONS_FILE}) before pikku dev registers webhooks.`
  }
  if (git(dir, ['check-ignore', '-q', WEBHOOK_REGISTRATIONS_FILE]) === 1) {
    const gitignore = join(dir, '.gitignore')
    const current = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : ''
    appendFileSync(
      gitignore,
      `${current && !current.endsWith('\n') ? '\n' : ''}${WEBHOOK_REGISTRATIONS_FILE}\n`
    )
  }
  return undefined
}

type RegistrationsFile = Record<string, WebhookRegistrations>

const readRegistrations = (file: string): RegistrationsFile =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}

/**
 * Registers the app's webhook sources with their providers from `pikku dev`.
 * What was registered is kept next to `pikku.config.json` rather than in the
 * dev database, so a database reset or a `.pikku` wipe does not register
 * everything again; providers that cap or rate-limit endpoints would not
 * forgive that. Nothing reaches a provider while the url and events are what
 * was last registered.
 */
export const reconcileDevWebhooks = async ({
  configDir,
  logger,
  singletonServices,
  env = process.env,
}: {
  configDir: string
  logger: Logger
  singletonServices: Parameters<
    typeof reconcileWebhookRegistrations
  >[0]['singletonServices']
  env?: NodeJS.ProcessEnv
}): Promise<void> => {
  const file = join(configDir, WEBHOOK_REGISTRATIONS_FILE)
  const declared = Object.keys(pikkuState(null, 'trigger', 'webhookSourceMeta'))
  if (declared.length === 0 && !existsSync(file)) return

  const baseUrl = env[DEV_WEBHOOK_URL_ENV]?.trim()
  if (!baseUrl) {
    if (declared.length > 0) {
      logger.info(
        `Webhook sources are not registered: set ${DEV_WEBHOOK_URL_ENV} to a public URL that reaches this server.`
      )
    }
    return
  }

  const refusal = guardFromGit(configDir)
  if (refusal) {
    logger.error(refusal)
    return
  }

  const labelPrefix = devWebhookLabelPrefix(env)
  const registrations = readRegistrations(file)
  const result = await reconcileWebhookRegistrations({
    baseUrl,
    labelPrefix,
    registrations: registrations[labelPrefix] ?? {},
    singletonServices,
  })
  registrations[labelPrefix] = result.registrations
  writeFileSync(file, `${JSON.stringify(registrations, null, 2)}\n`, {
    mode: 0o600,
  })
  // `mode` applies only when the file is created, not to one that already exists.
  chmodSync(file, 0o600)

  for (const outcome of result.outcomes) {
    if (outcome.status === 'unchanged') continue
    if (outcome.status === 'failed') {
      logger.warn(
        `Webhook source '${outcome.source}' failed to register at ${outcome.url}: ${outcome.error}`
      )
    } else if (outcome.status === 'manual') {
      logger.warn(
        `Webhook source '${outcome.source}' needs registering by hand: ${outcome.instructions}`
      )
    } else {
      logger.info(
        `Webhook source '${outcome.source}' ${outcome.status} at ${outcome.url}`
      )
    }
  }
  for (const orphan of result.orphans) {
    logger.warn(
      `Webhook source '${orphan.source}' is no longer declared but is still registered at ${orphan.url} (label ${orphan.label}). Delete it with the provider, then remove '${orphan.source}' under '${labelPrefix}' in ${WEBHOOK_REGISTRATIONS_FILE}.`
    )
  }
}
