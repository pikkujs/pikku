/**
 * The code the generated functions share. It is written into the project, so
 * what a request may do is readable there beside the functions.
 */
export const serializeCmsRuntime = ({
  errorLeaf,
}: {
  errorLeaf: string
}): string => `import { UnprocessableContentError } from '${errorLeaf}'
import type {
  CmsCollectionDescription,
  CmsDescription,
  CmsListCondition,
  CmsOperation,
} from '@pikku/core/cms'
import { hasScopes } from '@pikku/core/scope'

export type CmsValueKind = 'string' | 'number' | 'boolean' | 'datetime'

const TRUE: unknown[] = [true, 1, 1n, '1', 't', 'true']

const fromDb = (value: unknown, kind: CmsValueKind): unknown => {
  if (value === null || value === undefined) return null
  if (kind === 'number') return Number(value)
  if (kind === 'boolean') return TRUE.includes(value)
  return value instanceof Date ? value.toISOString() : value
}

/** A database row as a response carries it: the same on every engine. */
export const toCmsRow = <Row>(
  row: object,
  kinds: Record<keyof Row & string, CmsValueKind>
): Row =>
  Object.fromEntries(
    Object.entries(kinds as Record<string, CmsValueKind>).map(
      ([column, kind]) => [
        column,
        fromDb((row as Record<string, unknown>)[column], kind),
      ]
    )
  ) as Row

/** A date and time in the one form it is stored and compared in. */
export const cmsDatetime = (value: string): string => {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) {
    throw new UnprocessableContentError(\`'\${value}' is not a date and time\`)
  }
  return time.toISOString()
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
  checks: Partial<Record<CmsOperation, CmsAppCheck>>
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
  scope: string,
  services: CmsScopeServices,
  session: CmsSession
): Promise<boolean> =>
  hasScopes([scope], await cmsLiveScopes(services, session))


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
        const { functions } = description
        return {
          ...description,
          operations: description.operations.filter((op) => held.has(op)),
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
