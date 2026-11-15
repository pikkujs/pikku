import { Elysia, t } from 'elysia'
import { opentelemetry } from '@elysia/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { betterAuth } from 'better-auth'
import { openDb, readItem } from '../shared/db.js'
import { authOptions, hasPermission } from '../shared/auth-options.js'
import { routeTable } from '../shared/routes.js'

/**
 * Elysia written to its own docs, off the shelf: better-auth mounted and resolved through a macro (better-auth's Elysia page),
 * native TypeBox validation (the one validator difference from the other adapters), the official OpenTelemetry plugin with the
 * OTLP proto exporter when ELYSIA_OTEL=1 (OTEL_EXPORTER_OTLP_ENDPOINT points at the sink). No hand-written spans.
 */
const db = openDb(process.env.BENCH_DB!)
const auth = betterAuth({
  ...authOptions(process.env.BETTER_AUTH_SECRET!),
  database: { db, type: 'sqlite' },
})

const authMacro = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .macro({
    guard: (permission: string) => ({
      async resolve({ status, request: { headers } }: any) {
        const session = await auth.api.getSession({ headers })
        if (!session) return status(401, { name: 'MissingSessionError' })
        return { user: session.user }
      },
      beforeHandle({ user, status }: any) {
        if (!hasPermission(user.permissions, permission))
          return status(403, { name: 'ForbiddenError' })
      },
    }),
  })

let app: any = new Elysia()
if (process.env.ELYSIA_OTEL === '1')
  app = app.use(
    opentelemetry({
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
    })
  )
app = app.use(authMacro)

const body = t.Object({ id: t.Integer({ minimum: 1, maximum: 1000 }) })
for (const r of routeTable(Number(process.env.BENCH_ROUTES ?? 1)))
  app = app.post(
    r.path,
    async ({ body }: { body: { id: number } }) => {
      const row = await readItem(db, body.id)
      return { route: r.index, id: row!.id, name: row!.name, value: row!.value }
    },
    { guard: r.permission, body }
  )

app.listen({
  port: Number(process.env.PORT),
  hostname: process.env.HOST ?? '127.0.0.1',
})
