/**
 * `db/cms.ts` checked against `db/tables.ts` and read into the one form every
 * generator works from. Pure: whatever is refused here fails the build.
 */
import type { CmsImageType, CmsInputKind } from '@pikku/core/cms'
import type { TablesDeclaration } from '@pikku/core/db'
import type {
  CmsCheck,
  CmsColumn,
  CmsColumnFamily,
  CmsModel,
  CmsModelChecks,
  CmsModelCollection,
  CmsModelField,
} from './cms-model.types.js'
import { cmsFunctionNames, humanise } from './cms-names.js'

export interface BuildCmsModelInput {
  declaration: Record<string, unknown>
  /** Every table `db/tables.ts` declares, `declareOnly` ones included. */
  tables: TablesDeclaration
  /** The root `content.buckets` of pikku.config.json. */
  buckets: readonly string[]
}

const COLLECTION_NAME = /^[a-z][A-Za-z0-9]{0,62}$/

const IMAGE_TYPES: readonly CmsImageType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]

const COLLECTION_SETTINGS = [
  'label',
  'title',
  'thumbnail',
  'badge',
  'list',
  'edit',
  'detail',
  'submitted',
  'groups',
  'pii',
  'create',
  'delete',
  'permissions',
]
const LIST_SETTINGS = ['columns', 'filter', 'sort', 'search']
const CHECK_KEYS = ['read', 'create', 'edit', 'delete'] as const
const FIELD_SETTINGS: Record<string, string[]> = {
  derived: ['input', 'label', 'help'],
  longtext: ['input', 'label', 'help'],
  richtext: ['input', 'label', 'help'],
  relation: ['input', 'label', 'help'],
  money: ['input', 'label', 'help', 'currency'],
  image: ['input', 'label', 'help', 'bucket', 'accept', 'maxBytes'],
}

/** The longest an image key gets after `cms/<collection>/<field>/`: a UUID and `.webp`. */
const IMAGE_KEY_TAIL = 41

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const FAMILIES: Record<string, CmsColumnFamily> = {
  id: 'text',
  key: 'text',
  text: 'text',
  uuid: 'uuid',
  integer: 'integer',
  bigint: 'bigint',
  real: 'real',
  boolean: 'boolean',
  timestamp: 'timestamp',
  timestamptz: 'timestamp',
  json: 'json',
}

/** A column's declared type, or the one it takes from the column it references. */
const declaredType = (
  tables: TablesDeclaration,
  table: string,
  column: string,
  seen = new Set<string>()
): string | undefined => {
  const entry = tables[table]?.columns[column]
  if (!entry || seen.has(`${table}.${column}`)) return undefined
  if (entry.type) return entry.type
  if (!entry.references) return undefined
  seen.add(`${table}.${column}`)
  const [targetTable, targetColumn] = entry.references.split('.') as [
    string,
    string,
  ]
  return declaredType(tables, targetTable, targetColumn, seen)
}

const primaryKeyColumns = (
  declaration: TablesDeclaration[string]
): string[] => {
  const composite = declaration.primaryKey
  if (composite) {
    return Array.isArray(composite)
      ? [...composite]
      : [...(composite as { columns: readonly string[] }).columns]
  }
  return Object.entries(declaration.columns)
    .filter(([, column]) => column.primaryKey)
    .map(([name]) => name)
}

const readColumn = (
  tables: TablesDeclaration,
  table: string,
  name: string,
  keys: string[]
): CmsColumn | undefined => {
  const entry = tables[table]!.columns[name]!
  const type = declaredType(tables, table, name)
  if (!type) return undefined
  const primaryKey = keys.includes(name)
  const [targetTable, targetColumn] = entry.references?.split('.') ?? []
  return {
    name,
    type: type as CmsColumn['type'],
    family: type.startsWith('string(')
      ? 'text'
      : (FAMILIES[type] ?? ('text' as const)),
    kind: entry.kind,
    nullable: !entry.required && !primaryKey,
    hasDefault: entry.default !== undefined,
    hasOnUpdate: entry.onUpdate !== undefined,
    primaryKey,
    security: entry.security ?? 'private',
    form: entry.form ?? 'plain',
    inputFalse: entry.input === false,
    format: entry.format,
    enum: entry.enum,
    min: entry.min,
    max: entry.max,
    minLength: entry.minLength,
    maxLength:
      entry.maxLength ??
      (type.startsWith('string(') ? Number(type.slice(7, -1)) : undefined),
    pattern: entry.pattern,
    references: entry.references
      ? { table: targetTable!, column: targetColumn! }
      : undefined,
  }
}

const derivedInput = (column: CmsColumn): CmsInputKind => {
  if (column.references) return 'relation'
  if (column.enum) return 'select'
  if (column.family === 'boolean' || column.kind === 'bool') return 'toggle'
  if (column.kind === 'date' || column.family === 'timestamp') return 'datetime'
  if (column.format === 'isoDate') return 'date'
  if (column.format === 'isoDatetime') return 'datetime'
  if (['integer', 'bigint', 'real'].includes(column.family)) return 'number'
  if (column.format === 'email') return 'email'
  if (column.format === 'url') return 'url'
  return 'text'
}

/** A column the server fills when a record is created. */
export const isServerFilledKey = (column: CmsColumn): boolean =>
  column.primaryKey &&
  !column.hasDefault &&
  (column.family === 'uuid' ||
    (column.family === 'text' && (column.maxLength ?? 36) >= 36))

/** The column that versions a record for concurrent edits, when a table has one. */
export const versionColumn = (
  columns: Record<string, CmsColumn>
): CmsColumn | undefined => {
  const column = columns.updatedAt
  return column &&
    !column.primaryKey &&
    (column.family === 'timestamp' || column.family === 'text')
    ? column
    : undefined
}

const parseCheck = (value: unknown): CmsCheck | undefined => {
  if (typeof value !== 'string') return undefined
  const match =
    /^([A-Za-z0-9_@./-]+\.(?:ts|tsx|mts|js|mjs))#([A-Za-z_$][\w$]*)$/.exec(
      value
    )
  if (!match) return undefined
  const module = match[1]!.replace(/^\.\//, '')
  if (module.startsWith('/') || module.split('/').includes('..')) {
    return undefined
  }
  return { module, exportName: match[2]! }
}

const buildCollection = (
  name: string,
  entry: Record<string, unknown>,
  input: BuildCmsModelInput,
  problems: string[]
): CmsModelCollection | undefined => {
  const refuse = (message: string) => {
    problems.push(`${name}: ${message}`)
  }
  const unknown = (
    value: Record<string, unknown>,
    allowed: readonly string[],
    where: string
  ) => {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) refuse(`unknown ${where} '${key}'`)
    }
  }

  const table = input.tables[name]
  if (!table) {
    refuse(
      `db/tables.ts declares no table '${name}'. Declare it there (a table your migrations create is declared \`declareOnly: true\`).`
    )
    return undefined
  }
  unknown(entry, COLLECTION_SETTINGS, 'setting')

  const keys = primaryKeyColumns(table)
  if (keys.length !== 1) {
    refuse(
      `a collection needs a single-column primary key, and the table has ${keys.length === 0 ? 'none' : `(${keys.join(', ')})`}`
    )
    return undefined
  }
  const primaryKey = keys[0]!

  const columns: Record<string, CmsColumn> = {}
  /** Every column the declaration shows, checked once each. */
  const use = (column: unknown, where: string): column is string => {
    if (typeof column !== 'string' || !Object.hasOwn(table.columns, column)) {
      refuse(
        `${where} names ${JSON.stringify(column)}, which is no column of the table`
      )
      return false
    }
    if (columns[column]) return true
    const read = readColumn(input.tables, name, column, keys)
    if (!read) {
      refuse(
        `${where} names '${column}', which declares no type. Declare one in db/tables.ts.`
      )
      return false
    }
    if (read.security === 'secret') {
      refuse(`${where} names '${column}', which is secret`)
      return false
    }
    if (read.form !== 'plain') {
      refuse(
        `${where} names '${column}', which is held ${read.form}, not as plain text`
      )
      return false
    }
    if (read.family === 'json' || read.kind === 'json') {
      refuse(`${where} names '${column}', which is a json column`)
      return false
    }
    columns[column] = read
    return true
  }

  const columnList = (value: unknown, where: string): string[] => {
    if (value === undefined) return []
    if (!Array.isArray(value)) {
      refuse(`${where} must be a list of columns`)
      return []
    }
    if (new Set(value).size !== value.length) {
      refuse(`${where} names a column twice`)
    }
    return value.filter((column): column is string => use(column, where))
  }

  if (typeof entry.label !== 'string' || !entry.label.trim()) {
    refuse(`'label' must be a non-empty string`)
  }
  use(primaryKey, 'the primary key')
  const title = use(entry.title, 'title') ? (entry.title as string) : primaryKey
  const optional = (value: unknown, where: string) =>
    value !== undefined && use(value, where) ? value : undefined
  const thumbnail = optional(entry.thumbnail, 'thumbnail')
  const badge = optional(entry.badge, 'badge')

  const listEntry = isRecord(entry.list) ? entry.list : {}
  if (!isRecord(entry.list)) refuse(`'list' must say which columns it shows`)
  unknown(listEntry, LIST_SETTINGS, 'list setting')
  const list = {
    columns: columnList(listEntry.columns, 'list.columns'),
    filter: columnList(listEntry.filter, 'list.filter'),
    sort: columnList(listEntry.sort, 'list.sort'),
    search: columnList(listEntry.search, 'list.search'),
  }
  if (isRecord(entry.list) && list.columns.length === 0) {
    refuse(`list.columns must name at least one column`)
  }
  for (const key of ['filter', 'sort', 'search'] as const) {
    for (const column of list[key]) {
      if (!list.columns.includes(column)) {
        refuse(`list.${key} names '${column}', which is not in list.columns`)
      }
    }
  }
  for (const column of list.search) {
    if (columns[column]!.family !== 'text') {
      refuse(`list.search names '${column}', which is not a text column`)
    }
  }
  const detail = columnList(entry.detail, 'detail')
  const submitted = columnList(entry.submitted, 'submitted')

  for (const key of ['create', 'delete'] as const) {
    if (entry[key] !== undefined && typeof entry[key] !== 'boolean') {
      refuse(`'${key}' must be true or false`)
    }
  }
  const create = entry.create === true
  const remove = entry.delete === true

  const fields: CmsModelField[] = []
  if (entry.edit !== undefined && !isRecord(entry.edit)) {
    refuse(`'edit' must map columns to their inputs`)
  }
  for (const [column, raw] of Object.entries(
    isRecord(entry.edit) ? entry.edit : {}
  )) {
    if (raw === 'tags' || (isRecord(raw) && raw.input === 'tags')) {
      refuse(
        `edit.${column}: 'tags' is stored by an addon's handlers, so only an addon's collection has it`
      )
      continue
    }
    const settings: Record<string, unknown> | undefined =
      raw === true
        ? {}
        : typeof raw === 'string'
          ? { input: raw }
          : isRecord(raw)
            ? raw
            : undefined
    if (!settings) {
      refuse(`edit.${column} must be true, an input name or its settings`)
      continue
    }
    const named = settings.input
    const kind =
      named === undefined ? 'derived' : typeof named === 'string' ? named : ''
    if (!Object.hasOwn(FIELD_SETTINGS, kind)) {
      refuse(`edit.${column}: unknown input ${JSON.stringify(named)}`)
      continue
    }
    if ((kind === 'money' || kind === 'image') && typeof raw === 'string') {
      refuse(`edit.${column}: '${kind}' needs its settings`)
      continue
    }
    unknown(settings, FIELD_SETTINGS[kind]!, `edit.${column} setting`)
    if (!use(column, 'edit')) continue
    const declared = columns[column]!
    if (declared.primaryKey) {
      refuse(`edit.${column}: the primary key is never edited`)
      continue
    }
    if (declared.inputFalse) {
      refuse(
        `edit.${column}: the column is \`input: false\`, set by the server`
      )
      continue
    }
    if (submitted.includes(column)) {
      refuse(
        `edit.${column}: a column a visitor submitted is read-only. Take it out of 'edit' or of 'submitted'.`
      )
      continue
    }
    for (const text of ['label', 'help'] as const) {
      if (settings[text] !== undefined && typeof settings[text] !== 'string') {
        refuse(`edit.${column}.${text} must be a string`)
      }
    }

    const field: CmsModelField = {
      name: column,
      label:
        typeof settings.label === 'string' ? settings.label : humanise(column),
      help: typeof settings.help === 'string' ? settings.help : undefined,
      input:
        kind === 'derived' ? derivedInput(declared) : (kind as CmsInputKind),
    }

    const plainText = declared.family === 'text' && !declared.references
    if (
      (kind === 'longtext' || kind === 'richtext') &&
      (!plainText || declared.enum)
    ) {
      refuse(`edit.${column}: '${kind}' needs a free text column`)
      continue
    }
    if (kind === 'image') {
      if (!plainText || declared.enum || declared.format) {
        refuse(`edit.${column}: 'image' needs a free text column for its key`)
        continue
      }
      const { bucket, accept, maxBytes } = settings
      if (typeof bucket !== 'string' || !input.buckets.includes(bucket)) {
        refuse(
          `edit.${column}: bucket ${JSON.stringify(bucket)} is not in content.buckets of pikku.config.json (${input.buckets.join(', ') || 'none declared'})`
        )
      }
      if (
        !Array.isArray(accept) ||
        accept.length === 0 ||
        !accept.every((type) => IMAGE_TYPES.includes(type as CmsImageType))
      ) {
        refuse(
          `edit.${column}: 'accept' must list image types out of ${IMAGE_TYPES.join(', ')}`
        )
      }
      if (!Number.isInteger(maxBytes) || (maxBytes as number) <= 0) {
        refuse(`edit.${column}: 'maxBytes' must be a positive whole number`)
      }
      const keyLength = `cms/${name}/${column}/`.length + IMAGE_KEY_TAIL
      if (declared.maxLength !== undefined && declared.maxLength < keyLength) {
        refuse(
          `edit.${column}: an image key is up to ${keyLength} characters and the column holds ${declared.maxLength}`
        )
      }
      field.image = {
        bucket: String(bucket),
        accept: Array.isArray(accept) ? (accept as CmsImageType[]) : [],
        maxBytes: Number(maxBytes),
      }
    }
    if (kind === 'money') {
      if (declared.family !== 'integer' && declared.family !== 'bigint') {
        refuse(
          `edit.${column}: 'money' needs an integer column, in minor units`
        )
        continue
      }
      const { currency } = settings
      if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
        field.currency = { code: currency }
      } else if (
        typeof currency === 'string' &&
        Object.hasOwn(table.columns, currency)
      ) {
        if (use(currency, `edit.${column}.currency`)) {
          if (columns[currency]!.family !== 'text') {
            refuse(
              `edit.${column}: the currency column '${currency}' is not a text column`
            )
          }
          field.currency = { column: currency }
        }
      } else {
        refuse(
          `edit.${column}: 'currency' must be a column of the table or a three letter code such as 'EUR'`
        )
      }
    }
    if (kind === 'relation' && !declared.references) {
      refuse(`edit.${column}: 'relation' needs a column with 'references'`)
      continue
    }
    if (field.input === 'relation') field.target = declared.references!.table
    fields.push(field)
  }

  if (create && fields.length === 0) {
    refuse(`create is on, but 'edit' names no field to create a record with`)
  }
  if (create && submitted.length > 0) {
    refuse(
      `create is on, but records here are submitted by visitors: a submission is a hand-written function`
    )
  }

  const editable = fields.map((field) => field.name)
  const groups: { label: string; fields: string[] }[] = []
  if (entry.groups !== undefined && !Array.isArray(entry.groups)) {
    refuse(`'groups' must be a list`)
  }
  for (const group of Array.isArray(entry.groups) ? entry.groups : []) {
    if (
      !isRecord(group) ||
      typeof group.label !== 'string' ||
      !Array.isArray(group.fields)
    ) {
      refuse(`every group needs a 'label' and its 'fields'`)
      continue
    }
    unknown(group, ['label', 'fields'], 'group setting')
    for (const field of group.fields) {
      if (!editable.includes(field as string)) {
        refuse(
          `group '${group.label}' names ${JSON.stringify(field)}, which is not in 'edit'`
        )
      }
    }
    groups.push({ label: group.label, fields: group.fields as string[] })
  }

  if (thumbnail && !fields.some((f) => f.name === thumbnail && f.image)) {
    refuse(`thumbnail '${thumbnail}' must be an image field in 'edit'`)
  }

  const permissions = entry.permissions ?? {}
  const checks: CmsModelChecks = {}
  if (!isRecord(permissions)) {
    refuse(`'permissions' must map operations to checks`)
  } else {
    unknown(permissions, CHECK_KEYS, 'permissions key')
    const enabled = {
      read: true,
      create,
      edit: editable.length > 0,
      delete: remove,
    }
    for (const operation of CHECK_KEYS) {
      if (permissions[operation] === undefined) continue
      const check = parseCheck(permissions[operation])
      if (!check) {
        refuse(
          `permissions.${operation} must be '<module>#<export>', with the module's path from the project root`
        )
      } else if (!enabled[operation]) {
        refuse(
          `permissions.${operation} checks an operation the collection does not have`
        )
      } else {
        checks[operation] = check
      }
    }
  }

  const version = versionColumn(
    Object.hasOwn(table.columns, 'updatedAt')
      ? {
          updatedAt: readColumn(input.tables, name, 'updatedAt', keys)!,
        }
      : {}
  )
  const versioned =
    version && editable.length > 0 && !editable.includes('updatedAt')
      ? use('updatedAt', 'the version column')
      : false

  const currencyColumn = (field: CmsModelField) =>
    field.currency && 'column' in field.currency ? [field.currency.column] : []
  const unique = (names: (string | undefined)[]) => [
    ...new Set(names.filter((n): n is string => n !== undefined)),
  ]
  const listColumns = unique([
    primaryKey,
    ...list.columns,
    title,
    thumbnail,
    badge,
    ...fields
      .filter((field) => list.columns.includes(field.name))
      .flatMap(currencyColumn),
  ])
  const readColumns = unique([
    primaryKey,
    ...editable,
    ...fields.flatMap(currencyColumn),
    ...listColumns,
    ...detail,
    ...submitted,
    versioned ? 'updatedAt' : undefined,
  ])

  const pii = Array.isArray(entry.pii) ? (entry.pii as unknown[]) : []
  if (entry.pii !== undefined && !Array.isArray(entry.pii)) {
    refuse(`'pii' must be a list of columns`)
  }
  for (const column of pii) {
    if (typeof column !== 'string' || !Object.hasOwn(table.columns, column)) {
      refuse(
        `pii names ${JSON.stringify(column)}, which is no column of the table`
      )
    }
  }
  for (const column of readColumns) {
    if (columns[column]?.security === 'pii' && !pii.includes(column)) {
      refuse(
        `'${column}' is personal data the collection shows, so 'pii' must name it`
      )
    }
  }

  if (create) {
    for (const column of Object.keys(table.columns)) {
      const declared = readColumn(input.tables, name, column, keys)
      const required =
        declared === undefined
          ? Boolean(table.columns[column]!.required)
          : !declared.nullable && !declared.hasDefault
      if (!required) continue
      if (editable.includes(column)) continue
      if (declared && isServerFilledKey(declared)) continue
      if (versioned && column === 'updatedAt') continue
      refuse(
        `create is on, but nothing fills the required column '${column}': put it in 'edit' or give it a default in db/tables.ts`
      )
    }
  }

  return {
    name,
    label: String(entry.label),
    columns,
    primaryKey,
    title,
    thumbnail,
    badge,
    listColumns,
    readColumns,
    list,
    detail,
    submitted,
    groups,
    pii: pii as string[],
    create,
    edit: editable.length > 0,
    delete: remove,
    fields,
    checks,
    deletesAlso: [],
  }
}

/**
 * Check what one collection says about another: what a relation points at, and
 * what else a delete takes with it.
 */
const checkAcrossCollections = (
  collections: CmsModelCollection[],
  tables: TablesDeclaration,
  problems: string[]
) => {
  const byName = new Map(collections.map((c) => [c.name, c]))
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (field.input !== 'relation') continue
      const target = byName.get(field.target!)
      const column = collection.columns[field.name]!.references!.column
      if (!target) {
        problems.push(
          `${collection.name}: edit.${field.name} points at '${field.target}', which is not a collection. A relation shows its target's titles, behind the target's read.`
        )
      } else if (column !== target.primaryKey) {
        problems.push(
          `${collection.name}: edit.${field.name} references '${field.target}.${column}', and a relation must point at the primary key '${target.primaryKey}'`
        )
      }
    }
    const effects: string[] = []
    for (const [table, declaration] of Object.entries(tables)) {
      for (const entry of Object.values(declaration.columns)) {
        if (
          entry.references?.split('.')[0] === collection.name &&
          (entry.onDelete === 'cascade' || entry.onDelete === 'setNull')
        ) {
          effects.push(table)
        }
      }
    }
    collection.deletesAlso = [...new Set(effects)]
    if (collection.delete && collection.deletesAlso.length > 0) {
      problems.push(
        `${collection.name}: delete is on, but deleting a record would also delete or clear rows of ${collection.deletesAlso.join(', ')} through 'cascade' or 'setNull'`
      )
    }
  }
}

export const buildCmsModel = (input: BuildCmsModelInput): CmsModel => {
  const problems: string[] = []
  const collections: CmsModelCollection[] = []
  for (const [name, entry] of Object.entries(input.declaration)) {
    if (!COLLECTION_NAME.test(name)) {
      problems.push(
        `${JSON.stringify(name)} cannot name a collection: start with a lower case letter and use letters and digits only`
      )
      continue
    }
    if (!isRecord(entry)) {
      problems.push(`${name} must be an object`)
      continue
    }
    const collection = buildCollection(name, entry, input, problems)
    if (collection) collections.push(collection)
  }
  if (Object.keys(input.declaration).length === 0) {
    problems.push('it declares no collection')
  }
  if (problems.length === 0) {
    checkAcrossCollections(collections, input.tables, problems)
  }
  if (problems.length === 0) {
    const owners = new Map<string, string>()
    for (const collection of collections) {
      for (const functionName of cmsFunctionNames(collection)) {
        const owner = owners.get(functionName)
        if (owner !== undefined) {
          problems.push(
            `${owner} and ${collection.name} would both generate '${functionName}'. Rename one collection or field.`
          )
        }
        owners.set(functionName, collection.name)
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`db/cms.ts: ${problems.join('; ')}.`)
  }
  return { collections }
}
