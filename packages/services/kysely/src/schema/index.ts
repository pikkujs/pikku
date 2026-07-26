import { CamelCasePlugin, type Kysely } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'
import { aiSchema } from './ai.schema.js'
import { channelSchema } from './channel.schema.js'
import { credentialSchema } from './credential.schema.js'
import { deploymentSchema } from './deployment.schema.js'
import { scopeSchema } from './scope.schema.js'
import { secretSchema } from './secret.schema.js'
import { sessionSchema } from './session.schema.js'
import { webhookSchema } from './webhook.schema.js'
import { workflowSchema } from './workflow.schema.js'

export type {
  PikkuSchema,
  SchemaStatement,
  SchemaStatementFactory,
} from './pikku-schema.types.js'
export { rawStatement } from './pikku-schema.types.js'

/**
 * Every table the pikku runtime needs, in dependency order.
 *
 * Order is load-bearing, not cosmetic: `scope` has foreign keys onto Better
 * Auth's `user`, and the tables within each schema reference each other. Sort
 * this list alphabetically and it stops applying.
 */
export const pikkuSchemas: PikkuSchema[] = [
  channelSchema,
  sessionSchema,
  secretSchema,
  credentialSchema,
  deploymentSchema,
  webhookSchema,
  workflowSchema,
  aiSchema,
  scopeSchema,
]

/**
 * Bind a declaration to a database.
 *
 * The plugin is applied here rather than trusted to the caller. Declarations
 * name tables and columns the way the rest of the codebase queries them
 * (`aiThreads.resourceId`), and it is `CamelCasePlugin` that turns those into
 * the physical `ai_threads.resource_id`. Without it the same declaration
 * silently creates quoted camelCase tables that nothing can read.
 */
const bind = (db: Kysely<any>) => db.withPlugin(new CamelCasePlugin())

/** Create the tables, in order, on a database assumed to be empty. */
export const applyPikkuSchemas = async (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas
): Promise<void> => {
  const bound = bind(db)
  for (const schema of schemas) {
    for (const statement of schema.statements) {
      await statement(bound).execute()
    }
  }
}

/** Render the declaration as SQL for the dialect `db` was built with. */
export const compilePikkuSchemas = (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas
): string => {
  const bound = bind(db)
  return schemas
    .flatMap((schema) =>
      schema.statements.map((statement) => `${statement(bound).compile().sql};`)
    )
    .join('\n\n')
}
