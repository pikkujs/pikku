import { CamelCasePlugin, type Kysely } from 'kysely'
import type {
  PikkuSchema,
  RequiredTypes,
  SchemaRequirement,
} from './pikku-schema.types.js'
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
  RequiredTypes,
  SchemaRequirement,
  SchemaStatement,
  SchemaStatementFactory,
} from './pikku-schema.types.js'
export { rawStatement, requiredType } from './pikku-schema.types.js'

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

export interface UnmetRequirement {
  schema: PikkuSchema
  requirement: SchemaRequirement
}

/**
 * Look up every prerequisite in `db`, reporting the gaps and the types found.
 *
 * Both halves come from one introspection because they are one question. The
 * gaps say whether a schema can be applied at all; the types say how — a
 * foreign key onto a `uuid` primary key has to be declared `uuid`, and guessing
 * `text` produces DDL the database refuses.
 *
 * Introspection returns physical names, so `requires` is written in physical
 * names too — this is the one place in the declaration that is not camelCase.
 */
export const resolveRequirements = async (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas
): Promise<{ types: RequiredTypes; unmet: UnmetRequirement[] }> => {
  const tables = new Map(
    (await bind(db).introspection.getTables()).map((table) => [
      table.name,
      table,
    ])
  )

  const types: RequiredTypes = {}
  const unmet: UnmetRequirement[] = []
  for (const schema of schemas) {
    for (const requirement of schema.requires ?? []) {
      const column = tables
        .get(requirement.table)
        ?.columns.find((c) => c.name === requirement.column)
      if (!column) {
        unmet.push({ schema, requirement })
      } else {
        types[`${requirement.table}.${requirement.column}`] = column.dataType
      }
    }
  }
  return { types, unmet }
}

/**
 * The prerequisites `db` does not satisfy, as a list rather than a throw.
 *
 * Separate from `applyPikkuSchemas` because the two callers want opposite
 * things from the same answer: a service booting cannot proceed without its
 * tables, while a tool asking what a project's schema *would* be needs to
 * describe the gap rather than die on it.
 */
export const unsatisfiedRequirements = async (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas
): Promise<UnmetRequirement[]> => (await resolveRequirements(db, schemas)).unmet

/**
 * Create the tables, in order, on a database that has whatever they require.
 *
 * Prerequisites are checked before anything is created, so a project missing
 * one is told which schema wanted what — rather than being handed a foreign key
 * error, or a half-applied database to clean up.
 */
export const applyPikkuSchemas = async (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas
): Promise<void> => {
  const { types, unmet } = await resolveRequirements(db, schemas)
  if (unmet.length > 0) {
    throw new Error(
      unmet
        .map(
          ({ schema, requirement }) =>
            `The '${schema.name}' schema requires '${requirement.table}.${requirement.column}', which nothing has created. ` +
            `${requirement.owner} owns it — apply its schema first.`
        )
        .join('\n')
    )
  }

  const bound = bind(db)
  for (const schema of schemas) {
    for (const statement of schema.statements) {
      await statement(bound, types).execute()
    }
  }
}

/**
 * Render the declaration as SQL for the dialect `db` was built with.
 *
 * `types` comes from `resolveRequirements` against the database the migration
 * is being written for. Omit it and foreign keys onto another source's columns
 * compile as `text`, which is a shape, not a migration.
 */
export const compilePikkuSchemas = (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas,
  types: RequiredTypes = {}
): string => {
  const bound = bind(db)
  return schemas
    .flatMap((schema) =>
      schema.statements.map(
        (statement) => `${statement(bound, types).compile().sql};`
      )
    )
    .join('\n\n')
}
