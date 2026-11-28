import { COLLECTION_IMAGE_CHECK } from './serialize-collection-image-check.js'

/**
 * The code the generated functions share. It is written into the project, so
 * what a request may do is readable there beside the functions.
 */
export const serializeCollectionRuntime = ({
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
  CollectionDescription,
  CollectionHandlers,
  CollectionsDescription,
  CollectionsHandlers,
  CollectionListCondition,
  CollectionOperation,
} from '@pikku/core/collections'
import { hasScopes } from '@pikku/core/scope'

export type CollectionValueKind = 'string' | 'number' | 'boolean' | 'datetime'

const TRUE: unknown[] = [true, 1, 1n, '1', 't', 'true']

/**
 * A timestamp is read as the database's own text, under a name of its own. A
 * driver that parses one reads a time without a zone in the server's zone.
 */
export const collectionText = <Column extends string>(column: Column) =>
  sql<string | null>\`cast(\${sql.ref(column)} as text)\`.as(
    \`collectionText\${column.charAt(0).toUpperCase()}\${column.slice(1)}\` as \`collectionText\${Capitalize<Column>}\`
  )

/** Stored text as a response carries it; text that is no time stays as it is. */
export const collectionStoredValue = (
  value: unknown,
  kind: CollectionValueKind
): unknown => {
  if (value === null || value === undefined) return null
  if (kind === 'number') return Number(value)
  if (kind === 'boolean') return TRUE.includes(value)
  if (kind !== 'datetime') return value
  try {
    return collectionDatetime(String(value))
  } catch {
    return value
  }
}

/** A database row as a response carries it: the same on every engine. */
export const toCollectionRow = <Row>(
  row: object,
  kinds: Record<keyof Row & string, CollectionValueKind>
): Row =>
  Object.fromEntries(
    Object.entries(kinds as Record<string, CollectionValueKind>).map(
      ([column, kind]) => {
        const selected =
          kind === 'datetime'
            ? \`collectionText\${column.charAt(0).toUpperCase()}\${column.slice(1)}\`
            : column
        return [
          column,
          collectionStoredValue((row as Record<string, unknown>)[selected], kind),
        ]
      }
    )
  ) as Row

/**
 * A date and time in the one form it is stored and compared in. One that names
 * no zone is UTC, whatever zone the server runs in, and a day that does not
 * exist is refused instead of rolling into the next month.
 */
export const collectionDatetime = (value: string): string => {
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
export const collectionStoredDatetime = <Value extends string | null | undefined>(
  value: Value
): Value => (typeof value === 'string' ? collectionDatetime(value) : value) as Value

/** The handlers an addon ships for one of its collections. */
export const collectionAddonHandlers = (
  handlers: CollectionsHandlers,
  collection: string
): CollectionHandlers => handlers[collection]!

/** A record a handler answered, cut down to the columns the collection shows. */
export const collectionRecord = <Row>(
  row: object | null | undefined,
  kinds: Record<string, CollectionValueKind>,
  tagged = false
): Row => {
  if (!row) throw new NotFoundError('There is no record with that id')
  const values = row as Record<string, unknown>
  const record = Object.fromEntries(
    Object.entries(kinds).map(([column, kind]) => {
      const value = values[column]
      return [
        column,
        collectionStoredValue(
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
export const collectionPick = (
  values: object | undefined,
  kinds: Record<string, CollectionValueKind>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(kinds).flatMap(([column, kind]) => {
      const value = (values as Record<string, unknown> | undefined)?.[column]
      if (value === undefined) return []
      return [
        [
          column,
          kind === 'datetime' && typeof value === 'string'
            ? collectionDatetime(value)
            : value,
        ],
      ]
    })
  )

/** The file storage an app with image fields has. */
export const collectionContent = (
  content: ContentService | undefined
): ContentService => {
  if (!content) {
    throw new Error('A collection with an image needs the content service')
  }
  return content
}

/** A key of its own for every upload, so no upload replaces another's file. */
export const collectionImageKey = (
  prefix: string,
  extensions: Record<string, string>,
  contentType: string
): string => \`\${prefix}\${crypto.randomUUID()}.\${extensions[contentType]}\`

${COLLECTION_IMAGE_CHECK}
/**
 * A short-lived link to show an image. Only a key of the field's own is signed:
 * whatever else a column holds gets none.
 */
export const collectionPreviewUrl = async (
  content: ContentService | undefined,
  bucket: string,
  prefix: string,
  key: unknown
): Promise<string | null> =>
  typeof key === 'string' && key.startsWith(prefix) && !key.includes('..')
    ? collectionContent(content).getDownloadURL({
        bucket,
        key,
        visibility: 'private',
        expiresInSeconds: 300,
      })
    : null

/** The fields a patch changes, of which there must be one. */
export const collectionChanged = (values: object): string[] => {
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
export const collectionWrite = async <Result>(
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
export const collectionAudit = async (
  auditLog: AuditLog | undefined,
  change: 'created' | 'updated' | 'deleted',
  collection: string,
  id: string | number,
  fields: string[] = []
): Promise<void> => {
  await auditLog?.write({
    type: \`collections.record.\${change}\`,
    source: 'explicit',
    outcome: 'success',
    metadata: { collection, id: String(id), fields },
  })
}

/** Record that an addon's action ran, when the app has an audit log. */
export const collectionAuditAction = async (
  auditLog: AuditLog | undefined,
  action: string,
  collection: string,
  id: string | number
): Promise<void> => {
  await auditLog?.write({
    type: 'collections.record.action',
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
export const collectionConditions = (
  filter: object | object[] | undefined,
  kinds: Record<string, CollectionValueKind>
): CollectionListCondition[] =>
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
      kinds[column] === 'datetime' ? collectionDatetime(value as string) : value
    return used.map(([operator, value]) => {
      if (!(OPERATORS as readonly string[]).includes(operator)) {
        throw new UnprocessableContentError(
          \`'\${operator}' is not a filter operator\`
        )
      }
      return {
        column,
        operator: operator as CollectionListCondition['operator'],
        value: Array.isArray(value) ? value.map(convert) : convert(value),
      }
    })
  })

/**
 * A column as a filter or a sort compares it. SQLite holds a time as text, and
 * a column's default writes it in another form than a collection write does, so both are
 * compared in the form of a collection write there. Other engines compare times as times.
 */
export const collectionComparable = (
  db: { getExecutor(): { adapter: unknown } },
  column: string,
  kinds: Record<string, CollectionValueKind>
) =>
  kinds[column] === 'datetime' &&
  db.getExecutor().adapter instanceof SqliteAdapter
    ? sql\`strftime('%Y-%m-%dT%H:%M:%fZ', \${sql.ref(column)})\`
    : sql.ref(column)

export const COLLECTION_SQL_OPERATORS = {
  equals: '=',
  in: 'in',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
} as const

/** A page of at most 100, from an offset cursor. */
export const collectionPage = ({
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
export const collectionSearchPattern = (search: string): string =>
  \`%\${search.replace(/[!%_]/g, '!$&')}%\`

/** A caller, as the generated functions need to know one. */
type CollectionSession = {
  userId?: string
  scopes?: string[]
  scopesResolvedAt?: number
}

type CollectionScopeServices = {
  scopeService?: { resolveScopes: (userId: string) => Promise<string[]> }
}

/**
 * The scopes the caller holds now. A session that carries a snapshot of stored
 * grants is read again, so a revoked grant counts at once; scopes a session was
 * given outright carry no stamp and stand as they are.
 */
export const collectionLiveScopes = async (
  { scopeService }: CollectionScopeServices,
  session: CollectionSession
): Promise<string[]> =>
  session.scopesResolvedAt === undefined || !session.userId || !scopeService
    ? (session.scopes ?? [])
    : scopeService.resolveScopes(session.userId)

type CollectionAppCheck = (services: any, data: any, wire: any) => unknown

export interface CollectionDescribedCollection {
  description: CollectionDescription
  /** The app's checks, by operation and by action. */
  checks: Partial<Record<string, CollectionAppCheck>>
}

/**
 * Whether the app's check lets this caller through, as far as it can be said
 * without a record: a check that reads one is left to the function it guards.
 */
const collectionSessionCheck = async (
  check: CollectionAppCheck | undefined,
  services: object,
  session: CollectionSession
): Promise<boolean> =>
  !check ||
  !('__pikkuAuth' in check) ||
  Boolean(await check(services, undefined, { session }))

export const collectionHolds = async (
  scopes: string[],
  services: CollectionScopeServices,
  session: CollectionSession | undefined
): Promise<boolean> =>
  Boolean(session) &&
  hasScopes(scopes, await collectionLiveScopes(services, session!))

/** The app's check of the operation an upload is for, when it has one. */
export const collectionMustPass = async <Operation extends string>(
  checks: Partial<Record<Operation, CollectionAppCheck>>,
  operation: Operation,
  services: object,
  session: CollectionSession | undefined
): Promise<void> => {
  if (
    !session ||
    !(await collectionSessionCheck(checks[operation], services, session))
  ) {
    throw new ForbiddenError('You may not upload for this')
  }
}

/**
 * Whether the caller may point a record at another collection: its read scope,
 * and its read check when it has one. Asked before the target is looked up, so
 * a caller without it learns nothing about which records exist.
 */
export const collectionMayLink = async (
  scope: string,
  services: object,
  session: CollectionSession | undefined,
  check?: CollectionAppCheck
): Promise<void> => {
  if (
    !(await collectionHolds([scope], services as CollectionScopeServices, session)) ||
    !(await collectionSessionCheck(check, services, session!))
  ) {
    throw new ForbiddenError('You may not link to these records')
  }
}

/** The record a relation names, which has to be there. */
export const collectionLinked = (found: unknown, field: string): void => {
  if (!found) {
    throw new UnprocessableContentError(
      \`'\${field}' refers to a record that does not exist\`
    )
  }
}


/** The description cut down to what the caller may do. */
export const collectionDescribe = async (
  collections: CollectionDescribedCollection[],
  services: object,
  session: CollectionSession | undefined
): Promise<CollectionsDescription> => {
  if (!session) return { collections: [] }
  const scopes = await collectionLiveScopes(services as CollectionScopeServices, session)
  const readable: CollectionDescribedCollection[] = []
  for (const collection of collections) {
    const read = \`collections:\${collection.description.name}:read\`
    if (
      hasScopes([read], scopes) &&
      (await collectionSessionCheck(collection.checks.read, services, session))
    ) {
      readable.push(collection)
    }
  }
  const targets = new Set(readable.map((c) => c.description.name))

  return {
    collections: await Promise.all(
      readable.map(async ({ description, checks }) => {
        const held = new Set<CollectionOperation>(['read'])
        for (const operation of description.operations) {
          if (
            operation !== 'read' &&
            hasScopes([\`collections:\${description.name}:\${operation}\`], scopes) &&
            (await collectionSessionCheck(checks[operation], services, session))
          ) {
            held.add(operation)
          }
        }
        const writes = held.has('create') || held.has('edit')
        const actions = []
        for (const action of description.actions) {
          if (
            hasScopes([\`collections:\${description.name}:\${action.name}\`], scopes) &&
            (await collectionSessionCheck(checks[action.name], services, session))
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
