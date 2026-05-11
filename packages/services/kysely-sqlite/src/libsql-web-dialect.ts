import {
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type CompiledQuery,
  type QueryResult,
  type Kysely,
  type DatabaseIntrospector,
  type DialectAdapter,
  type QueryCompiler,
} from 'kysely'

/**
 * Kysely dialect for libsql over the *HTTP pipeline* transport (v2/pipeline).
 *
 * Why this file exists at all:
 *   - @libsql/kysely-libsql imports @libsql/client (Node), which uses node:http.
 *     CF Workers nodejs_compat_v2 doesn't ship node:http -> upload error 10021.
 *   - @libsql/client/web imports both ./http.js and ./ws.js at module top, and
 *     ./ws.js pulls in `ws` which does `require('node:events')` at load time.
 *     CF Workers also doesn't ship node:events -> upload error 10021.
 *   - @libsql/client/http re-uses @libsql/hrana-client's index which still
 *     imports ws transitively for the same reason.
 *
 * So we talk to the libsql/Turso HTTP pipeline directly with fetch. Single
 * endpoint, single round-trip per execute. Transactions use the `baton`
 * mechanism: every response returns a baton, and resending it on the next
 * request keeps the same server-side stream (== same SQL connection ==
 * same transaction).
 *
 * Pipeline reference: https://github.com/tursodatabase/libsql/blob/main/docs/HTTP_V2_SPEC.md
 */
export interface LibsqlWebDialectConfig {
  url: string
  authToken?: string
}

export class LibsqlWebDialect implements Dialect {
  constructor(private readonly config: LibsqlWebDialectConfig) {}
  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }
  createDriver(): Driver {
    return new LibsqlWebDriver(this.config)
  }
  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }
  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }
}

type HranaValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string }

interface HranaStmtResult {
  cols: Array<{ name: string | null; decltype: string | null }>
  rows: HranaValue[][]
  affected_row_count: number
  last_insert_rowid: string | null
}

interface PipelineResponse {
  baton: string | null
  base_url: string | null
  results: Array<
    | {
        type: 'ok'
        response:
          | { type: 'execute'; result: HranaStmtResult }
          | { type: 'close' }
      }
    | { type: 'error'; error: { message: string; code?: string } }
  >
}

class LibsqlWebDriver implements Driver {
  private readonly endpoint: string
  private readonly authHeader: string | undefined
  constructor(config: LibsqlWebDialectConfig) {
    // Accept libsql://, https://, http://. The pipeline is HTTP only.
    // Turso embeds the JWT in the URL as ?authToken=... — honor that, but let
    // an explicit config.authToken win.
    const u = new URL(config.url)
    const scheme = u.protocol === 'libsql:' ? 'https:' : u.protocol
    const tokenFromUrl = u.searchParams.get('authToken') ?? undefined
    this.endpoint = `${scheme}//${u.host}/v2/pipeline`
    const token = config.authToken ?? tokenFromUrl
    this.authHeader = token ? `Bearer ${token}` : undefined
  }
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new LibsqlWebConnection(this.endpoint, this.authHeader)
  }
  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlWebConnection).executeRaw('BEGIN')
  }
  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlWebConnection).executeRaw('COMMIT')
  }
  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlWebConnection).executeRaw('ROLLBACK')
  }
  async releaseConnection(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlWebConnection).close()
  }
  async destroy(): Promise<void> {}
}

class LibsqlWebConnection implements DatabaseConnection {
  private baton: string | null = null
  private endpoint: string
  constructor(
    initialEndpoint: string,
    private readonly authHeader: string | undefined
  ) {
    this.endpoint = initialEndpoint
  }

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.runStmt(query.sql, query.parameters)
    return decodeResult<R>(result)
  }

  async *streamQuery<R>(
    query: CompiledQuery
  ): AsyncIterableIterator<QueryResult<R>> {
    yield this.executeQuery<R>(query)
  }

  async executeRaw(sql: string): Promise<void> {
    await this.runStmt(sql, [])
  }

  async close(): Promise<void> {
    if (this.baton === null) return
    await this.send([{ type: 'close' }])
    this.baton = null
  }

  private async runStmt(
    sql: string,
    args: readonly unknown[]
  ): Promise<HranaStmtResult> {
    const resp = await this.send([
      {
        type: 'execute',
        stmt: { sql, args: args.map(encodeArg) },
      },
    ])
    const r = resp.results[0]
    if (!r) throw new Error('libsql: empty pipeline response')
    if (r.type === 'error')
      throw new Error(
        `libsql: ${r.error.message}${r.error.code ? ` (${r.error.code})` : ''}`
      )
    if (r.response.type !== 'execute')
      throw new Error(`libsql: unexpected response type ${r.response.type}`)
    return r.response.result
  }

  private async send(requests: unknown[]): Promise<PipelineResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.authHeader) headers.authorization = this.authHeader
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ baton: this.baton, requests }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`libsql HTTP ${res.status}: ${body}`)
    }
    const json = (await res.json()) as PipelineResponse
    this.baton = json.baton
    if (json.base_url)
      this.endpoint = `${json.base_url.replace(/\/$/, '')}/v2/pipeline`
    return json
  }
}

function encodeArg(v: unknown): HranaValue {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'string') return { type: 'text', value: v }
  if (typeof v === 'number')
    return Number.isInteger(v)
      ? { type: 'integer', value: String(v) }
      : { type: 'float', value: v }
  if (typeof v === 'bigint') return { type: 'integer', value: v.toString() }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  if (v instanceof ArrayBuffer)
    return { type: 'blob', base64: bytesToBase64(new Uint8Array(v)) }
  if (v instanceof Uint8Array) return { type: 'blob', base64: bytesToBase64(v) }
  throw new Error(`libsql: unsupported argument type ${typeof v}`)
}

function decodeValue(v: HranaValue): unknown {
  switch (v.type) {
    case 'null':
      return null
    case 'integer': {
      const n = Number(v.value)
      return Number.isSafeInteger(n) ? n : BigInt(v.value)
    }
    case 'float':
      return v.value
    case 'text':
      return v.value
    case 'blob':
      return base64ToBytes(v.base64)
  }
}

function decodeResult<R>(r: HranaStmtResult): QueryResult<R> {
  const colNames = r.cols.map((c, i) => c.name ?? `c${i}`)
  const rows = r.rows.map((row) => {
    const o: Record<string, unknown> = {}
    for (let i = 0; i < colNames.length; i++)
      o[colNames[i]!] = decodeValue(row[i]!)
    return o as R
  })
  return {
    rows,
    numAffectedRows: BigInt(r.affected_row_count),
    insertId:
      r.last_insert_rowid !== null ? BigInt(r.last_insert_rowid) : undefined,
  }
}

function bytesToBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!)
  return btoa(s)
}
function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
