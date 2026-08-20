import { pikkuConfig } from '#pikku/setup'

/**
 * The one place this template's database URL is written down: the runtime
 * opens its Kysely against it, and `pikku db generate` / `pikku db migrate`
 * read it off the config to know which database the runtime tables belong in.
 */
export const connectionString =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5432/pikku_queue'

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
    jwtSecrets: {
      remote: 'PIKKU_REMOTE_SECRET',
    },
    postgresUrl: connectionString,
  }
})
