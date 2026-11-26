import { CMS_IMAGE_CHECK } from './serialize-cms-image-check.js'

/**
 * The code the generated functions share. It is written into the project, so
 * what a request may do is readable there beside the functions.
 */
export const serializeCmsRuntime = ({
  errorLeaf,
}: {
  errorLeaf: string
}): string => `import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableContentError,
} from '${errorLeaf}'
import { SqliteAdapter, sql } from 'kysely'
import type { AuditLog, ContentService } from '@pikku/core/services'
import type {
  CmsCollectionDescription,
  CmsCollectionHandlers,
  CmsDescription,
  CmsHandlers,
  CmsListCondition,
  CmsOperation,
} from '@pikku/core/cms'
import { hasScopes } from '@pikku/core/scope'

export type CmsValueKind = 'string' | 'number' | 'boolean' | 'datetime'

const TRUE: unknown[] = [true, 1, 1n, '1', 't', 'true']

/**
 * A timestamp is read as the database's own text, under a name of its own. A
 * driver that parses one reads a time without a zone in the server's zone.
 */
export const cmsText = <Column extends string>(column: Column) =>
  sql<string | null>\`cast(\${sql.ref(column)} as text)\`.as(
    \`cmsText\${column.charAt(0).toUpperCase()}\${column.slice(1)}\` as \`cmsText\${Capitalize<Column>}\`
  )

/** Stored text as a response carries it; text that is no time stays as it is. */
export const cmsStoredValue = (
  value: unknown,
  kind: CmsValueKind
): unknown => {
  if (value === null || value === undefined) return null
  if (kind === 'number') return Number(value)
  if (kind === 'boolean') return TRUE.includes(value)
  if (kind !== 'datetime') return value
  try {
    return cmsDatetime(String(value))
  } catch {
    return value
  }
}

/** A database row as a response carries it: the same on every engine. */
export const toCmsRow = <Row>(
  row: object,
  kinds: Record<keyof Row & string, CmsValueKind>
): Row =>
  Object.fromEntries(
    Object.entries(kinds as Record<string, CmsValueKind>).map(
      ([column, kind]) => {
        const selected =
          kind === 'datetime'
            ? \`cmsText\${column.charAt(0).toUpperCase()}\${column.slice(1)}\`
            : column
        return [
          column,
          cmsStoredValue((row as Record<string, unknown>)[selected], kind),
        ]
      }
    )
  ) as Row

/**
 * A date and time in the one form it is stored and compared in. One that names
 * no zone is UTC, whatever zone the server runs in, and a day that does not
 * exist is refused instead of rolling into the next month.
 */
export const cmsDatetime = (value: string): string => {
  const [, day = '', clock = '', zone = ''] =
    /^([^T ]*)(?:[T ](.*?)(Z|[+-]\\d{2}(?::?\\d{2})?)?)?$/.exec(value) ?? []
  const midnight = new Date(\`\${day}T00:00:00Z\`)
  const time = new Date(
    clock ? \`\${day}T\${clock}\${zone.length === 3 ? \`\${zone}:00\` : zone || 'Z'}\` : midnight
  )
  if (
    Number.isNaN(midnight.getTime()) ||
    Number.isNaN(time.getTime()) ||
    midnight.toISOString().slice(0, 10) !== day
  ) {
    throw new UnprocessableContentError(\`'\${value}' is not a date and time\`)
  }
  return time.toISOString()
}

/** A timestamp to store: left out stays left out, and \`null\` clears it. */
export const cmsStoredDatetime = <Value extends string | null | undefined>(
  value: Value
): Value => (typeof value === 'string' ? cmsDatetime(value) : value) as Value

/** The handlers an addon ships for one of its collections. */
export const cmsAddonHandlers = (
  handlers: CmsHandlers,
  collection: string
): CmsCollectionHandlers => handlers[collection]!

/** A record a handler answered, cut down to the columns the collection shows. */
export const cmsRecord = <Row>(
  row: object | null | undefined,
  kinds: Record<string, CmsValueKind>,
  tagged = false
): Row => {
  if (!row) throw new NotFoundError('There is no record with that id')
  const values = row as Record<string, unknown>
  const record = Object.fromEntries(
    Object.entries(kinds).map(([column, kind]) => {
      const value = values[column]
      return [
        column,
        cmsStoredValue(
          value instanceof Date ? value.toISOString() : value,
          kind
        ),
      ]
    })
  )
  return (
    tagged ? { ...record, tags: [...((values.tags as string[]) ?? [])] } : record
  ) as Row
}

/** What a handler is handed: the named values the caller gave, key by key. */
export const cmsPick = (
  values: object | undefined,
  kinds: Record<string, CmsValueKind>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(kinds).flatMap(([column, kind]) => {
      const value = (values as Record<string, unknown> | undefined)?.[column]
      if (value === undefined) return []
      return [
        [
          column,
          kind === 'datetime' && typeof value === 'string'
            ? cmsDatetime(value)
            : value,
        ],
      ]
    })
  )

/** The file storage an app with image fields has. */
export const cmsContent = (
  content: ContentService | undefined
): ContentService => {
  if (!content) {
    throw new Error('A CMS collection with an image needs the content service')
  }
  return content
}

/** A key of its own for every upload, so no upload replaces another's file. */
export const cmsImageKey = (
  prefix: string,
  extensions: Record<string, string>,
  contentType: string
): string => \`\${prefix}\${crypto.randomUUID()}.\${extensions[contentType]}\`

${CMS_IMAGE_CHECK}
/**
 * A short-lived link to show an image. Only a key of the field's own is signed:
 * whatever else a column holds gets none.
 */
export const cmsPreviewUrl = async (
  content: ContentService | undefined,
  bucket: string,
  prefix: string,
  key: unknown
): Promise<string | null> =>
  typeof key === 'string' && key.startsWith(prefix) && !key.includes('..')
    ? cmsContent(content).getDownloadURL({
        bucket,
        key,
        visibility: 'private',
        expiresInSeconds: 300,
      })
    : null

/** The fields a patch changes, of which there must be one. */
export const cmsChanged = (values: object): string[] => {
  const fields = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
  if (fields.length === 0) {
    throw new UnprocessableContentError('The patch changes nothing')
  }
  return fields
}

/**
 * Answer what a database refuses as the caller's error, without repeating the
 * database's message, which can name tables and values.
 */
export const cmsWrite = async <Result>(
  operation: 'create' | 'update' | 'delete',
  write: () => Promise<Result>
): Promise<Result> => {
  try {
    return await write()
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string }
    const refused = (state: string[], sqlite: RegExp) =>
      state.includes(code ?? '') || sqlite.test(message ?? '')
    if (refused(['23505'], /UNIQUE constraint failed/i)) {
      throw new ConflictError('A record with one of these values already exists')
    }
    if (refused(['23503', '23001'], /FOREIGN KEY constraint failed/i)) {
      if (operation === 'delete') {
        throw new ConflictError('Other records still refer to this one')
      }
      throw new UnprocessableContentError(
        'One of these values refers to a record that does not exist'
      )
    }
    if (
      refused(
        ['23502', '23514', '22001', '22003', '22007', '22008', '22P02'],
        /(CHECK|NOT NULL) constraint failed/i
      )
    ) {
      throw new UnprocessableContentError(
        'The database refused one of these values'
      )
    }
    throw error
  }
}

/**
 * Record a change in the audit log, when the app has one. It names the record
 * and the fields that changed, never a value: values can be personal data.
 */
export const cmsAudit = async (
  auditLog: AuditLog | undefined,
  change: 'created' | 'updated' | 'deleted',
  collection: string,
  id: string | number,
  fields: string[] = []
): Promise<void> => {
  await auditLog?.write({
    type: \`cms.record.\${change}\`,
    source: 'explicit',
    outcome: 'success',
    metadata: { collection, id: String(id), fields },
  })
}

/** Record that an addon's action ran, when the app has an audit log. */
export const cmsAuditAction = async (
  auditLog: AuditLog | undefined,
  action: string,
  collection: string,
  id: string | number
): Promise<void> => {
  await auditLog?.write({
    type: 'cms.record.action',
    source: 'explicit',
    outcome: 'success',
    metadata: { collection, id: String(id), action },
  })
}

const OPERATORS = ['equals', 'in', 'gt', 'gte', 'lt', 'lte'] as const

/**
 * A filter as conditions that all apply. The schema has already limited the
 * columns, the operators and the values; what it cannot say is that a column
 * needs at least one operator.
 */
export const cmsConditions = (
  filter: object | object[] | undefined,
  kinds: Record<string, CmsValueKind>
): CmsListCondition[] =>
  [filter ?? []].flat().flatMap((leaf) => {
    const entries = Object.entries(leaf as Record<string, object>)
    if (entries.length !== 1) {
      throw new UnprocessableContentError('A filter names one column')
    }
    const [column, operators] = entries[0]!
    const used = Object.entries(operators).filter(
      ([, value]) => value !== undefined
    )
    if (!Object.hasOwn(kinds, column) || used.length === 0) {
      throw new UnprocessableContentError(\`A filter on '\${column}' is not valid\`)
    }
    const convert = (value: unknown) =>
      kinds[column] === 'datetime' ? cmsDatetime(value as string) : value
    return used.map(([operator, value]) => {
      if (!(OPERATORS as readonly string[]).includes(operator)) {
        throw new UnprocessableContentError(
          \`'\${operator}' is not a filter operator\`
        )
      }
      return {
        column,
        operator: operator as CmsListCondition['operator'],
        value: Array.isArray(value) ? value.map(convert) : convert(value),
      }
    })
  })

/**
 * A column as a filter or a sort compares it. SQLite holds a time as text, and
 * a column's default writes it in another form than the CMS does, so both are
 * compared in the CMS's form there. Other engines compare times as times.
 */
export const cmsComparable = (
  db: { getExecutor(): { adapter: unknown } },
  column: string,
  kinds: Record<string, CmsValueKind>
) =>
  kinds[column] === 'datetime' &&
  db.getExecutor().adapter instanceof SqliteAdapter
    ? sql\`strftime('%Y-%m-%dT%H:%M:%fZ', \${sql.ref(column)})\`
    : sql.ref(column)

export const CMS_SQL_OPERATORS = {
  equals: '=',
  in: 'in',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
} as const

/** A page of at most 100, from an offset cursor. */
export const cmsPage = ({
  limit,
  cursor,
}: {
  limit?: number
  cursor?: string
}) => ({
  limit: Math.min(Math.max(limit ?? 20, 1), 100),
  offset: cursor === undefined ? 0 : Number(cursor),
})

/** A search for the text itself: the wildcards in it are plain characters. */
export const cmsSearchPattern = (search: string): string =>
  \`%\${search.replace(/[!%_]/g, '!$&')}%\`

/** A caller, as the generated functions need to know one. */
type CmsSession = {
  userId?: string
  scopes?: string[]
  scopesResolvedAt?: number
}

type CmsScopeServices = {
  scopeService?: { resolveScopes: (userId: string) => Promise<string[]> }
}

/**
 * The scopes the caller holds now. A session that carries a snapshot of stored
 * grants is read again, so a revoked grant counts at once; scopes a session was
 * given outright carry no stamp and stand as they are.
 */
export const cmsLiveScopes = async (
  { scopeService }: CmsScopeServices,
  session: CmsSession
): Promise<string[]> =>
  session.scopesResolvedAt === undefined || !session.userId || !scopeService
    ? (session.scopes ?? [])
    : scopeService.resolveScopes(session.userId)

type CmsAppCheck = (services: any, data: any, wire: any) => unknown

export interface CmsDescribedCollection {
  description: CmsCollectionDescription
  /** The app's checks, by operation and by action. */
  checks: Partial<Record<string, CmsAppCheck>>
}

/**
 * Whether the app's check lets this caller through, as far as it can be said
 * without a record: a check that reads one is left to the function it guards.
 */
const cmsSessionCheck = async (
  check: CmsAppCheck | undefined,
  services: object,
  session: CmsSession
): Promise<boolean> =>
  !check ||
  !('__pikkuAuth' in check) ||
  Boolean(await check(services, undefined, { session }))

export const cmsHolds = async (
  scopes: string[],
  services: CmsScopeServices,
  session: CmsSession | undefined
): Promise<boolean> =>
  Boolean(session) &&
  hasScopes(scopes, await cmsLiveScopes(services, session!))

/** The app's check of the operation an upload is for, when it has one. */
export const cmsMustPass = async <Operation extends string>(
  checks: Partial<Record<Operation, CmsAppCheck>>,
  operation: Operation,
  services: object,
  session: CmsSession | undefined
): Promise<void> => {
  if (
    !session ||
    !(await cmsSessionCheck(checks[operation], services, session))
  ) {
    throw new ForbiddenError('You may not upload for this')
  }
}

/**
 * Whether the caller may point a record at another collection: its read scope,
 * and its read check when it has one. Asked before the target is looked up, so
 * a caller without it learns nothing about which records exist.
 */
export const cmsMayLink = async (
  scope: string,
  services: object,
  session: CmsSession | undefined,
  check?: CmsAppCheck
): Promise<void> => {
  if (
    !(await cmsHolds([scope], services as CmsScopeServices, session)) ||
    !(await cmsSessionCheck(check, services, session!))
  ) {
    throw new ForbiddenError('You may not link to these records')
  }
}

/** The record a relation names, which has to be there. */
export const cmsLinked = (found: unknown, field: string): void => {
  if (!found) {
    throw new UnprocessableContentError(
      \`'\${field}' refers to a record that does not exist\`
    )
  }
}


/** The description cut down to what the caller may do. */
export const cmsDescribe = async (
  collections: CmsDescribedCollection[],
  services: object,
  session: CmsSession | undefined
): Promise<CmsDescription> => {
  if (!session) return { collections: [] }
  const scopes = await cmsLiveScopes(services as CmsScopeServices, session)
  const readable: CmsDescribedCollection[] = []
  for (const collection of collections) {
    const read = \`cms:\${collection.description.name}:read\`
    if (
      hasScopes([read], scopes) &&
      (await cmsSessionCheck(collection.checks.read, services, session))
    ) {
      readable.push(collection)
    }
  }
  const targets = new Set(readable.map((c) => c.description.name))

  return {
    collections: await Promise.all(
      readable.map(async ({ description, checks }) => {
        const held = new Set<CmsOperation>(['read'])
        for (const operation of description.operations) {
          if (
            operation !== 'read' &&
            hasScopes([\`cms:\${description.name}:\${operation}\`], scopes) &&
            (await cmsSessionCheck(checks[operation], services, session))
          ) {
            held.add(operation)
          }
        }
        const writes = held.has('create') || held.has('edit')
        const actions = []
        for (const action of description.actions) {
          if (
            hasScopes([\`cms:\${description.name}:\${action.name}\`], scopes) &&
            (await cmsSessionCheck(checks[action.name], services, session))
          ) {
            actions.push(action)
          }
        }
        const { functions } = description
        return {
          ...description,
          operations: description.operations.filter((op) => held.has(op)),
          actions,
          functions: {
            list: functions.list,
            get: functions.get,
            ...(held.has('create') ? { create: functions.create } : {}),
            ...(held.has('edit') ? { update: functions.update } : {}),
            ...(held.has('delete') ? { delete: functions.delete } : {}),
          },
          deletesAlso: held.has('delete') ? description.deletesAlso : [],
          fields: description.fields.map(
            ({ uploadFunction, optionsFunction, ...field }) => ({
              ...field,
              editable: field.editable && writes,
              required: field.required && held.has('create'),
              ...(writes && uploadFunction ? { uploadFunction } : {}),
              ...(writes && optionsFunction && targets.has(field.target!)
                ? { optionsFunction }
                : {}),
            })
          ),
        }
      })
    ),
  }
}
`
