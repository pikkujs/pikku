import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PikkuCiFailedError } from './console-removal.js'

/**
 * Cloudflare's adapter neither applies migrations nor uploads secrets, so
 * shipping would run the new code against an old schema or missing values.
 * Nothing here can ask Cloudflare what has been applied, so a migration in the
 * output counts as pending until the caller says otherwise.
 */
export const assertCloudflareDeployReady = (
  providerDir: string,
  {
    env = process.env,
    migrationsApplied = false,
  }: { env?: NodeJS.ProcessEnv; migrationsApplied?: boolean } = {}
) => {
  const infraFile = join(providerDir, 'infra.json')
  if (!existsSync(infraFile)) {
    throw new PikkuCiFailedError(
      `No infra.json in ${providerDir}, so the deploy cannot be checked.`
    )
  }
  const { secrets = [] } = JSON.parse(readFileSync(infraFile, 'utf-8')) as {
    secrets?: Array<{ id: string }>
  }
  const unset = secrets.map(({ id }) => id).filter((id) => !env[id])

  const dbDir = join(providerDir, 'db')
  const migrations =
    migrationsApplied || !existsSync(dbDir)
      ? []
      : readdirSync(dbDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .flatMap((engine) =>
            readdirSync(join(dbDir, engine.name))
              .filter((file) => file.endsWith('.sql'))
              .map((file) => `${engine.name}/${file}`)
          )

  const problems = [
    ...(unset.length
      ? [`Required secrets are not set: ${unset.join(', ')}.`]
      : []),
    ...(migrations.length
      ? [
          `Migrations ship with this deploy and Cloudflare will not apply them: ${migrations.join(', ')}. Apply them, then pass --migrationsApplied.`,
        ]
      : []),
  ]
  if (problems.length) {
    throw new PikkuCiFailedError(
      `Refusing to deploy to Cloudflare. ${problems.join(' ')}`
    )
  }
}
