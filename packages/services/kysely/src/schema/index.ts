import { CamelCasePlugin, type Kysely } from 'kysely'
import {
  schemaContext,
  type PikkuSchema,
  type RequiredTypes,
  type SchemaContext,
  type SchemaRequirement,
} from './pikku-schema.types.js'
import { agentSchema } from './agent.schema.js'
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
  SchemaContext,
  SchemaRequirement,
  SchemaStatement,
  SchemaStatementFactory,
} from './pikku-schema.types.js'
export {
  rawStatement,
  requiredType,
  schemaContext,
  unqualifiedContext,
} from './pikku-schema.types.js'

/**
 * Opt-in, so it is named here rather than folded into `pikkuSchemas` — the
 * runtime works without an audit table, and `KyselyAuditService.init()` applies
 * this for the projects that wire the sink.
 */
export { auditSchema } from './audit.schema.js'

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
  agentSchema,
  scopeSchema,
]

/**
 * Bind a declaration to a database.
 *
 * The plugin is applied here rather than trusted to the caller. Declarations
 * name tables and columns the way the rest of the codebase queries them
 * (`agentThreads.resourceId`), and it is `CamelCasePlugin` that turns those into
 * the physical `agent_threads.resource_id`. Without it the same declaration
 * silently creates quoted camelCase tables that nothing can read.
 */
const bind = (db: Kysely<any>) => db.withPlugin(new CamelCasePlugin())

/**
 * The schema a connection is bound to, or `undefined` for one that is not.
 *
 * Read back out of compiled DDL rather than off the connection, because kysely
 * keeps the `withSchema(...)` setting inside its executor and exposes no way to
 * ask. Compiling a throwaway `create table` is the same trick `declaredTables`
 * uses on the real statements, against the same regex — nothing is executed and
 * the probe never leaves this function.
 *
 * Derived rather than passed in so that raw statements follow whatever
 * connection they are handed. A caller that had to remember to say the schema
 * twice would eventually say it once.
 */
const boundSchema = (db: Kysely<any>): string | undefined =>
  CREATE_TABLE.exec(
    db.schema.createTable('pikkuSchemaProbe').addColumn('id', 'text').compile()
      .sql
  )?.[1]

/** The context for statements compiled against `db`, matching its binding. */
const contextFor = (db: Kysely<any>): SchemaContext =>
  schemaContext(boundSchema(db))

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
 *
 * The statements then run in one transaction, so the same promise holds for a
 * failure the check cannot foresee: a statement that dies mid-list takes the
 * ones before it with it. On an engine without transactional DDL the rollback
 * is the engine's to give, not ours.
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

  await db.transaction().execute(async (trx) => {
    const bound = bind(trx)
    const ctx = contextFor(bound)
    for (const schema of schemas) {
      for (const statement of schema.statements) {
        const query = statement(bound, types, ctx)
        try {
          await query.execute()
        } catch (error) {
          throw explain(error, query.compile().sql, schema)
        }
      }
    }
  })
}

/** `references "app"."workflow_runs"` — a foreign key onto a qualified table. */
const QUALIFIED_REFERENCE = /references "[^"]+"\."[^"]+"/i

/**
 * sqlite's own words for "you put a dot where a table name goes".
 *
 * Matched rather than a driver's `code`, because every sqlite binding
 * (better-sqlite3, node:sqlite, bun:sqlite, libsql) passes the engine's message
 * through verbatim while disagreeing about how to label it. Postgres phrases the
 * same class of error the other way round — `syntax error at or near "."` — so
 * this cannot fire on it.
 */
const SQLITE_REJECTED_QUALIFIER = /near "\.":\s*syntax error/i

/**
 * Say what a schema-bound connection did to the DDL, when that is what failed.
 *
 * `withSchema(...)` qualifies foreign key targets along with everything else.
 * Postgres needs that — an unqualified reference resolves against `search_path`,
 * which a schema-bound connection does not control — and sqlite refuses it: a
 * `REFERENCES` clause there takes a bare table name, because a foreign key can
 * only point inside the same database, so there is no qualifier to give. One
 * declaration cannot spell both, and what the engine says about it is
 * `near ".": syntax error`, which names neither the schema nor the cause.
 *
 * Gated on sqlite's exact phrasing as well as the SQL. Postgres compiles the
 * same qualified reference legitimately, and can raise a syntax error of its own
 * on this DDL — a column type resolved from `requires` goes in verbatim — so a
 * looser `/syntax error/` would answer for postgres in sqlite's name.
 */
const explain = (error: unknown, sql: string, schema: PikkuSchema): unknown => {
  const message = error instanceof Error ? error.message : String(error)
  if (
    !QUALIFIED_REFERENCE.test(sql) ||
    !SQLITE_REJECTED_QUALIFIER.test(message)
  ) {
    return error
  }
  return new Error(
    `The '${schema.name}' schema has a foreign key, and this connection is bound to a schema, ` +
      `so it compiled to a qualified 'references "schema"."table"' that the database rejected. ` +
      'sqlite is the engine that does this: its REFERENCES clause takes a bare table name. ' +
      'Use a connection without withSchema(...) there — sqlite has one schema to be in — ' +
      'or write the schema down as a migration with `pikku db generate` and apply it yourself. ' +
      `The database said: ${message}`,
    { cause: error }
  )
}

/** A table a schema creates, as the DDL addresses it. */
export interface DeclaredTable {
  /** Present when the connection is `withSchema(...)`-bound. */
  schema?: string
  name: string
}

/** How a table reads in an error message: qualified only when it is. */
const displayName = (table: DeclaredTable): string =>
  table.schema ? `${table.schema}.${table.name}` : table.name

/**
 * `create table "workflow_runs"` and `create table "app"."workflow_runs"`.
 *
 * The schema half is optional and the table is always the LAST quoted
 * identifier — matching the first one instead reads a `withSchema('app')`
 * connection's DDL as a table called `app`, which is no table at all.
 */
const CREATE_TABLE =
  /^\s*create table (?:if not exists\s+)?(?:"([^"]+)"\.)?"([^"]+)"/i

/**
 * The tables a schema creates, read back out of its own compiled SQL.
 *
 * Derived rather than declared alongside the statements, because a hand-kept
 * list of names is a second source of truth: rename a table in a statement and
 * the list keeps answering for the old one.
 *
 * Compiled against `db` rather than in the abstract, so the answer carries the
 * schema the DDL will actually target — the same binding the lookup has to use.
 */
export const declaredTables = (
  schema: PikkuSchema,
  db: Kysely<any>
): DeclaredTable[] => {
  const bound = bind(db)
  const ctx = contextFor(bound)
  const tables: DeclaredTable[] = []
  for (const statement of schema.statements) {
    const match = CREATE_TABLE.exec(statement(bound, {}, ctx).compile().sql)
    if (match) tables.push({ schema: match[1], name: match[2]! })
  }
  return tables
}

/** What `ensurePikkuSchema` found when it looked. */
export type EnsureOutcome = 'present' | 'created'

/**
 * What `db` already has, indexed both ways.
 *
 * Introspection reports every schema it can see, so the bare name alone cannot
 * answer the question: a `workflow_runs` in some other schema is not the one a
 * `withSchema('app')` connection reads or writes. Qualified declarations are
 * matched on the pair. Unqualified DDL resolves against the connection's
 * search_path, which is not knowable from here, so it falls back to the name.
 */
interface ExistingTables {
  qualified: Set<string>
  bare: Set<string>
  /** Whether this engine reports schemas at all. */
  schemaAware: boolean
}

const tablesOf = async (db: Kysely<any>): Promise<ExistingTables> => {
  const tables = await bind(db).introspection.getTables()
  return {
    qualified: new Set(
      tables
        .filter((table) => table.schema)
        .map((table) => `${table.schema}.${table.name}`)
    ),
    bare: new Set(tables.map((table) => table.name)),
    schemaAware: tables.some((table) => table.schema !== undefined),
  }
}

/**
 * Qualified declarations match on the pair — but only where that pair means
 * something.
 *
 * `TableMetadata.schema` is optional, and sqlite and mysql leave it unset:
 * sqlite has one schema to be in, and mysql calls the thing a database. A
 * `withSchema('main')` connection there declares `main.workflow_runs` while
 * introspection can only offer `workflow_runs`, and holding out for the pair
 * would read every existing table as missing — the same false negative this
 * whole function exists to fix, arrived at from the other side. So when the
 * engine reports no schemas, the bare name is the only name there is.
 */
const isPresent = (existing: ExistingTables, table: DeclaredTable): boolean =>
  table.schema && existing.schemaAware
    ? existing.qualified.has(`${table.schema}.${table.name}`)
    : existing.bare.has(table.name)

/**
 * Make sure one schema's tables are there, creating them only if none are.
 *
 * What a service calls at boot. It looks before it creates, which is the whole
 * difference from the `.ifNotExists()` DDL this replaces: that spelling turned
 * every failure into a silent no-op, and hid a foreign key onto `user.id` that
 * postgres had been rejecting since the day it was written.
 *
 * A partially-present schema is refused rather than completed. Half a schema
 * means something else already applied part of it — a migration, an older
 * version, a hand-run script — and creating the remainder at boot would leave
 * two authorities over one set of tables, which is the condition all of this
 * exists to end.
 *
 * Creating at boot is the fallback, not the intent. `pikku db generate` writes
 * the declaration down as a migration; a project that has done so takes the
 * `present` path and this never issues DDL at all.
 */
export const ensurePikkuSchema = async (
  db: Kysely<any>,
  schema: PikkuSchema
): Promise<EnsureOutcome> => {
  const existing = await tablesOf(db)
  const declared = declaredTables(schema, db)
  const missing = declared.filter((table) => !isPresent(existing, table))

  if (missing.length === 0) return 'present'

  if (missing.length < declared.length) {
    throw new Error(
      `The '${schema.name}' schema is half applied: ${missing.map(displayName).join(', ')} missing, ` +
        `${declared
          .filter((table) => isPresent(existing, table))
          .map(displayName)
          .join(', ')} already there. ` +
        'Something else owns part of it. Reconcile it with a migration — ' +
        '`pikku db generate` writes the declaration down — rather than creating the rest at boot.'
    )
  }

  try {
    await applyPikkuSchemas(db, [schema])
    return 'created'
  } catch (error) {
    // Two instances booting cold against one database can both see it empty
    // before either has finished creating. If the other one got there, say so;
    // anything else is a real failure and still throws. This is a courtesy, not
    // a guarantee — a boot race is only fully answered by having run the
    // migration, which is what `pikku db generate` is for.
    const after = await tablesOf(db)
    if (declared.every((table) => isPresent(after, table))) return 'present'
    throw error
  }
}

/**
 * Render the declaration as SQL for the dialect `db` was built with.
 *
 * `types` comes from `resolveRequirements` against the database the migration
 * is being written for. Omit it and foreign keys onto another source's columns
 * compile as `text`, which is a shape, not a migration.
 *
 * `schema` qualifies every table the migration creates, for a project that
 * keeps the runtime tables somewhere other than the default search path. It is
 * applied here and not to `db` itself because the caller's connection is a
 * throwaway the declaration was just *applied* to, in whatever schema that
 * database actually has — qualifying that would create tables in a schema the
 * scratch database has never heard of. Only the rendered SQL is bound.
 */
export const compilePikkuSchemas = (
  db: Kysely<any>,
  schemas: PikkuSchema[] = pikkuSchemas,
  types: RequiredTypes = {},
  schemaName?: string
): string => {
  const bound = schemaName ? bind(db).withSchema(schemaName) : bind(db)
  const ctx = contextFor(bound)
  return schemas
    .flatMap((schema) =>
      schema.statements.map(
        (statement) => `${statement(bound, types, ctx).compile().sql};`
      )
    )
    .join('\n\n')
}
