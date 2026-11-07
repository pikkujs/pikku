import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PikkuCiFailedError } from './console-removal.js'

/**
 * Cloudflare's adapter neither applies migrations nor uploads secrets, so
 * shipping would run the new code against an old schema or missing values.
 * Nothing here can ask Cloudflare what is set or applied, so both count as
 * missing until the caller confirms them.
 */
export const assertCloudflareDeployReady = (
  providerDir: string,
  {
    secretsSet = false,
    migrationsApplied = false,
  }: { secretsSet?: boolean; migrationsApplied?: boolean } = {}
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
  const unconfirmed = secretsSet ? [] : secrets.map(({ id }) => id)

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
    ...(unconfirmed.length
      ? [
          `This deploy needs these secrets set in Cloudflare: ${unconfirmed.join(', ')}. Set them, then pass --secretsSet.`,
        ]
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
