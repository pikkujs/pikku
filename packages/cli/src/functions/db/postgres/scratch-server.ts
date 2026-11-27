import { randomBytes } from 'node:crypto'

/**
 * A Postgres server the CLI may create and drop throwaway databases on, in place
 * of the embedded PGlite instance. It is read from its own variable so that the
 * app's database URL is never used for this without being asked.
 */
export const SCRATCH_SERVER_ENV = 'PIKKU_SCRATCH_DATABASE_URL'

export const scratchServerUrl = (): string | undefined =>
  process.env[SCRATCH_SERVER_ENV] || undefined

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

const connect = async (connectionString: string) => {
  const { Client } = await import('pg')
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

/**
 * Run against a database on `serverUrl` that exists only for the duration of
 * `run`. A database rather than a schema, so that SQL naming `public.` or
 * creating schemas of its own stays inside the throwaway.
 */
export async function withScratchServerDatabase<T>(
  serverUrl: string,
  run: (
    client: Awaited<ReturnType<typeof connect>>,
    connectionString: string
  ) => Promise<T>
): Promise<T> {
  const name = `pikku_scratch_${randomBytes(6).toString('hex')}`
  const admin = await connect(serverUrl)
  try {
    try {
      await admin.query(`CREATE DATABASE "${name}"`)
    } catch (error: any) {
      throw new Error(
        `Could not create a scratch database on the ${SCRATCH_SERVER_ENV} server: ${error?.message ?? error}. ` +
          `Grant its role CREATEDB, or unset ${SCRATCH_SERVER_ENV} to use the embedded PGlite database.`,
        { cause: error }
      )
    }
    try {
      const connectionString = withDatabase(serverUrl, name)
      const client = await connect(connectionString)
      try {
        return await run(client, connectionString)
      } finally {
        await client.end()
      }
    } finally {
      // FORCE, so that a connection `run` left open cannot keep it alive.
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    }
  } finally {
    await admin.end()
  }
}
