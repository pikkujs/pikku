import { betterAuth } from 'better-auth'
import { Validator } from '@cfworker/json-schema'
import { openDb, readItem } from '../shared/db.js'
import { authOptions, hasPermission } from '../shared/auth-options.js'
import { itemJsonSchema, routeTable } from '../shared/routes.js'

/**
 * Raw Bun: a plain Bun.serve fetch handler with a Map lookup to pick the route. No framework, no router library.
 * Per request it does the same steps as the Pikku app with the same libraries: better-auth getSession from the cookie (database
 * read), a plain permission function, @cfworker/json-schema validation of the same schema (compiled once at start), the same
 * one SQLite read, JSON out, no logging.
 */
const db = openDb(process.env.BENCH_DB!)
const auth = betterAuth({
  ...authOptions(process.env.BETTER_AUTH_SECRET!),
  database: { db, type: 'sqlite' },
})
const validator = new Validator(JSON.parse(JSON.stringify(itemJsonSchema)))

const json = (status: number, body: unknown) => Response.json(body, { status })

type Handler = (data: { id: number }) => Promise<unknown>
const routes = new Map<string, { permission: string; handler: Handler }>(
  routeTable(Number(process.env.BENCH_ROUTES ?? 1)).map((r) => [
    r.path,
    {
      permission: r.permission,
      handler: async ({ id }) => {
        const row = await readItem(db, id)
        return {
          route: r.index,
          id: row!.id,
          name: row!.name,
          value: row!.value,
        }
      },
    },
  ])
)

Bun.serve({
  port: Number(process.env.PORT),
  hostname: process.env.HOST ?? '127.0.0.1',
  async fetch(req) {
    const url = req.url
    const start = url.indexOf('/', url.indexOf('//') + 2)
    const queryAt = url.indexOf('?', start)
    const route = routes.get(
      queryAt === -1 ? url.slice(start) : url.slice(start, queryAt)
    )
    if (!route || req.method !== 'POST')
      return json(404, { name: 'NotFoundError' })
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) return json(401, { name: 'MissingSessionError' })
    if (!hasPermission((session.user as any).permissions, route.permission))
      return json(403, { name: 'ForbiddenError' })
    let data: any
    try {
      data = await req.json()
    } catch {
      return json(422, { name: 'UnprocessableContentError' })
    }
    if (!validator.validate(data).valid)
      return json(422, { name: 'UnprocessableContentError' })
    return json(200, await route.handler(data))
  },
})

process.on('SIGTERM', () => process.exit(0))
