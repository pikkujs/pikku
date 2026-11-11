import type {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  QueryResult,
  TransactionSettings,
} from 'kysely'
import { childTraceWire } from '@pikku/core/trace'
import type { Span, TraceContext, Tracer } from '@pikku/core/trace'
import { collectTableNames, hasInlineSql } from './table-names.js'

// knowledge: decisions/query-spans-record-operation-and-table-sql-text-opt-in-never-parameters.md

export interface TraceDriverOptions {
  /** Where finished spans go. With none, the driver is a pass-through. */
  tracer?: Tracer
  /**
   * The trace the running query belongs to, read per query: one Kysely serves
   * many invocations. With `Tracer.runInSpan` the runner puts the function's
   * span here, so the child's parent is the function span. When it returns
   * nothing no span is recorded: a span with no known parent is never guessed.
   */
  currentTrace?: () => TraceContext | undefined
  /**
   * Record the statement text on the span (`db.query.text`), at most
   * {@link SQL_TEXT_LIMIT} characters. Default false: an explicit opt-in.
   * Only a query built from structured nodes has its text recorded (values
   * are `?` / `$n` placeholders); a query with raw SQL, `sql.lit` or a JSON
   * path records no text. Parameter values are never read either way.
   */
  recordSqlText?: boolean
  /** `db.system`: `sqlite`, `postgresql`, `mysql`. */
  system: string
}

/** Longest `db.query.text` that is recorded. */
export const SQL_TEXT_LIMIT = 1024

const OPERATIONS: Record<string, string> = {
  SelectQueryNode: 'select',
  InsertQueryNode: 'insert',
  UpdateQueryNode: 'update',
  DeleteQueryNode: 'delete',
}

/**
 * The statement text, or undefined when it cannot be trusted to hold only
 * placeholders. Text compiled from structured nodes (select, insert, update,
 * delete) has `?` / `$n` where a value goes; text from raw SQL, an immediate
 * literal (`sql.lit`) or a JSON path can carry anything, and no masking of
 * SQL (escapes, comments, quoting rules per dialect) is reliable, so such a
 * query records no text at all. Fails closed: any doubt means no text.
 */
const sqlText = (query: CompiledQuery): string | undefined => {
  const kind = (query.query as { kind?: string }).kind ?? ''
  if (!(kind in OPERATIONS)) return undefined
  if (hasInlineSql(query.query)) return undefined
  const { sql } = query
  return sql.length > SQL_TEXT_LIMIT
    ? `${sql.slice(0, SQL_TEXT_LIMIT - 1)}…`
    : sql
}

/** The class of a driver error, never its message (which can echo values). */
const errorClass = (error: unknown): string => {
  if (error instanceof Error) {
    return error.name && error.name !== 'Error'
      ? error.name
      : error.constructor?.name || 'Error'
  }
  return error === null ? 'null' : typeof error
}

/** An error carrying only a class name: what a db span's `end()` is given. */
const classOnly = (type: string): Error => {
  const error = new Error('')
  error.name = type
  return error
}

type SavepointRest =
  Parameters<NonNullable<Driver['savepoint']>> extends [unknown, ...infer Rest]
    ? Rest
    : never

class TracedConnection implements DatabaseConnection {
  constructor(
    readonly inner: DatabaseConnection,
    private readonly options: TraceDriverOptions,
    private readonly state: { disabled: boolean }
  ) {}

  executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const span = this.open(query)
    if (!span) return this.inner.executeQuery<R>(query)
    return this.inner.executeQuery<R>(query).then(
      (result) => {
        this.close(span)
        return result
      },
      (error) => {
        this.close(span, errorClass(error))
        throw error
      }
    )
  }

  // Streams are not spanned: their duration is the consumer's, not the query's.
  streamQuery<R>(
    query: CompiledQuery,
    chunkSize?: number
  ): AsyncIterableIterator<QueryResult<R>> {
    return this.inner.streamQuery<R>(query, chunkSize as number)
  }

  private open(query: CompiledQuery): Span | undefined {
    const { tracer, currentTrace, recordSqlText, system } = this.options
    if (!tracer || !currentTrace || this.state.disabled) return undefined
    try {
      const parent = currentTrace()
      if (!parent || !parent.sampled) return undefined
      const child = childTraceWire(parent).trace
      const operation =
        OPERATIONS[(query.query as { kind?: string }).kind ?? ''] ?? 'other'
      const attributes: Record<string, string> = {
        'db.system': system,
        'db.operation.name': operation,
      }
      const tables = new Set<string>()
      collectTableNames(query.query, tables)
      const [table] = tables
      if (table !== undefined)
        attributes['db.collection.name'] = table.slice(0, 128)
      if (recordSqlText) {
        const text = sqlText(query)
        if (text !== undefined) attributes['db.query.text'] = text
      }
      return tracer.startSpan(`db.${operation}`, child, {
        kind: 'client',
        attributes,
      })
    } catch {
      // A tracer that throws costs the traces, never the query.
      this.state.disabled = true
      return undefined
    }
  }

  private close(span: Span, failure?: string) {
    try {
      if (failure === undefined) {
        span.end({ code: 'ok' })
      } else {
        span.addEvent('exception', { 'exception.type': failure })
        span.end({ code: 'error', error: classOnly(failure) })
      }
    } catch {
      this.state.disabled = true
    }
  }
}

/**
 * Wraps a Kysely driver so every statement run on one of its connections is a
 * `db.<operation>` client span, a child of {@link TraceDriverOptions.currentTrace}.
 * Only the connection sees a statement start and end, which is why this is a
 * driver wrapper and not a plugin. Transaction control (begin, commit,
 * rollback) goes to the real connection and is not spanned.
 */
export function traceDriver(
  driver: Driver,
  options: TraceDriverOptions
): Driver {
  if (!options.tracer || !options.currentTrace) return driver
  const state = { disabled: false }
  const wrapped = new WeakMap<DatabaseConnection, TracedConnection>()
  const raw = (connection: DatabaseConnection): DatabaseConnection =>
    connection instanceof TracedConnection ? connection.inner : connection
  return {
    init: () => driver.init(),
    acquireConnection: async () => {
      const connection = await driver.acquireConnection()
      let traced = wrapped.get(connection)
      if (!traced) {
        traced = new TracedConnection(connection, options, state)
        wrapped.set(connection, traced)
      }
      return traced
    },
    beginTransaction: (
      connection: DatabaseConnection,
      settings: TransactionSettings
    ) => driver.beginTransaction(raw(connection), settings),
    commitTransaction: (connection) =>
      driver.commitTransaction(raw(connection)),
    rollbackTransaction: (connection) =>
      driver.rollbackTransaction(raw(connection)),
    ...(driver.savepoint
      ? {
          savepoint: (connection: DatabaseConnection, ...rest: SavepointRest) =>
            driver.savepoint!(raw(connection), ...rest),
        }
      : {}),
    ...(driver.rollbackToSavepoint
      ? {
          rollbackToSavepoint: (
            connection: DatabaseConnection,
            ...rest: SavepointRest
          ) => driver.rollbackToSavepoint!(raw(connection), ...rest),
        }
      : {}),
    ...(driver.releaseSavepoint
      ? {
          releaseSavepoint: (
            connection: DatabaseConnection,
            ...rest: SavepointRest
          ) => driver.releaseSavepoint!(raw(connection), ...rest),
        }
      : {}),
    releaseConnection: (connection) =>
      driver.releaseConnection(raw(connection)),
    destroy: () => driver.destroy(),
  }
}

/** {@link traceDriver} for a whole dialect: what a factory passes to `new Kysely`. */
export function traceDialect(
  dialect: Dialect,
  options: TraceDriverOptions
): Dialect {
  if (!options.tracer || !options.currentTrace) return dialect
  return {
    createDriver: () => traceDriver(dialect.createDriver(), options),
    createQueryCompiler: () => dialect.createQueryCompiler(),
    createAdapter: () => dialect.createAdapter(),
    createIntrospector: (db) => dialect.createIntrospector(db),
  }
}
