/**
 * `db/crud.ts` checked against `db/tables.ts` and read into the one form every
 * generator works from. Pure: whatever is refused here fails the build.
 */
import type { CrudImageType, CrudInputKind } from '@pikku/core/crud'
import type { TablesDeclaration } from '@pikku/core/db'
import type {
  CrudCheck,
  CrudColumn,
  CrudColumnFamily,
  CrudModel,
  CrudModelAction,
  CrudModelChecks,
  CrudModelCollection,
  CrudModelField,
  CrudModelTags,
} from './crud-model.types.js'
import { crudFunctionNames, humanise } from './crud-names.js'

export interface BuildCrudModelInput {
  declaration: Record<string, unknown>
  /** Every table `db/tables.ts` declares, `declareOnly` ones included. */
  tables: TablesDeclaration
  /** The root `content.buckets` of pikku.config.json. */
  buckets: readonly string[]
  /** The wired addons that run against this project's database. */
  addons?: CrudAddonSource[]
  /**
   * The declaration is an addon's own: its handlers do the reading and writing,
   * so it may name actions and tags.
   */
  addon?: boolean
}

/** What a wired addon published, keyed by the name it is wired under. */
export interface CrudAddonSource {
  name: string
  package: string
  /** The tables it declares, whether or not it publishes collections. */
  tables: TablesDeclaration
  /** Its `db/crud.ts` as data, absent when it publishes none. */
  collections?: Record<string, unknown>
}

const ACTION_SETTINGS = ['label', 'input', 'confirm']
const ACTION_NAME = /^[a-z][A-Za-z0-9]{0,62}$/
/** Names a scope leaf, a permission or a description field already has. */
const RESERVED_ACTIONS = ['read', 'create', 'edit', 'delete', 'update']
const TAGS = 'tags'

const COLLECTION_NAME = /^[a-z][A-Za-z0-9]{0,62}$/

const IMAGE_TYPES: readonly CrudImageType[] = [
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
const TAGS_SETTINGS = ['input', 'label', 'help', 'maxItems', 'maxLength']

/** The longest an image key gets after `crud/<collection>/<field>/`: a UUID and `.webp`. */
const IMAGE_KEY_TAIL = 41

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const FAMILIES: Record<string, CrudColumnFamily> = {
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
): CrudColumn | undefined => {
  const entry = tables[table]!.columns[name]!
  const type = declaredType(tables, table, name)
  if (!type) return undefined
  const primaryKey = keys.includes(name)
  const [targetTable, targetColumn] = entry.references?.split('.') ?? []
  return {
    name,
    type: type as CrudColumn['type'],
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

export const derivedInput = (column: CrudColumn): CrudInputKind => {
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
export const isServerFilledKey = (column: CrudColumn): boolean =>
  column.primaryKey &&
  !column.hasDefault &&
  (column.family === 'uuid' ||
    (column.family === 'text' && (column.maxLength ?? 36) >= 36))

/** The column that versions a record for concurrent edits, when a table has one. */
export const versionColumn = (
  columns: Record<string, CrudColumn>
): CrudColumn | undefined => {
  const column = columns.updatedAt
  return column &&
    !column.primaryKey &&
    (column.family === 'timestamp' || column.family === 'text')
    ? column
    : undefined
}

/**
 * The version column the server stamps on each write, which is also what an
 * update compares so two editors cannot silently overwrite each other.
 */
export const stampedColumn = (
  collection: Pick<CrudModelCollection, 'columns' | 'edit' | 'fields'>
): CrudColumn | undefined => {
  const version = versionColumn(collection.columns)
  return version &&
    collection.edit &&
    !collection.fields.some((field) => field.name === version.name)
    ? version
    : undefined
}

export const imageFields = (collection: CrudModelCollection) =>
  collection.fields.filter((field) => field.image)

/** The collection a relation points at, which the model has checked is there. */
export const relationTarget = (
  model: CrudModel,
  target: string
): CrudModelCollection =>
  model.collections.find((collection) => collection.name === target)!

const parseCheck = (value: unknown): CrudCheck | undefined => {
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
  input: BuildCrudModelInput,
  problems: string[]
): CrudModelCollection | undefined => {
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
  unknown(
    entry,
    input.addon
      ? [...COLLECTION_SETTINGS.filter((s) => s !== 'permissions'), 'actions']
      : COLLECTION_SETTINGS,
    'setting'
  )

  const keys = primaryKeyColumns(table)
  if (keys.length !== 1) {
    refuse(
      `a collection needs a single-column primary key, and the table has ${keys.length === 0 ? 'none' : `(${keys.join(', ')})`}`
    )
    return undefined
  }
  const primaryKey = keys[0]!

  const columns: Record<string, CrudColumn> = {}
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

  const fields: CrudModelField[] = []
  let tags: CrudModelTags | undefined
  if (entry.edit !== undefined && !isRecord(entry.edit)) {
    refuse(`'edit' must map columns to their inputs`)
  }
  for (const [column, raw] of Object.entries(
    isRecord(entry.edit) ? entry.edit : {}
  )) {
    if (raw === TAGS || (isRecord(raw) && raw.input === TAGS)) {
      if (!input.addon) {
        refuse(
          `edit.${column}: 'tags' is stored by an addon's handlers, so only an addon's collection has it`
        )
        continue
      }
      if (column !== TAGS || Object.hasOwn(table.columns, TAGS)) {
        refuse(
          `edit.${column}: 'tags' is a field of its own, named 'tags', and no column`
        )
        continue
      }
      const given: Record<string, unknown> = isRecord(raw) ? raw : {}
      unknown(given, TAGS_SETTINGS, `edit.${column} setting`)
      const limit = (key: 'maxItems' | 'maxLength', fallback: number) => {
        const value = given[key] ?? fallback
        if (!Number.isInteger(value) || (value as number) <= 0) {
          refuse(`edit.tags: '${key}' must be a positive whole number`)
        }
        return Number(value)
      }
      tags = {
        label: typeof given.label === 'string' ? given.label : 'Tags',
        help: typeof given.help === 'string' ? given.help : undefined,
        maxItems: limit('maxItems', 20),
        maxLength: limit('maxLength', 50),
      }
      fields.push({
        name: TAGS,
        label: tags.label,
        help: tags.help,
        input: TAGS,
      })
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

    const field: CrudModelField = {
      name: column,
      label:
        typeof settings.label === 'string' ? settings.label : humanise(column),
      help: typeof settings.help === 'string' ? settings.help : undefined,
      input:
        kind === 'derived' ? derivedInput(declared) : (kind as CrudInputKind),
    }

    // Both are served by queries and files of the host's own, which an addon's
    // handlers do not offer.
    if (
      input.addon &&
      (kind === 'image' ||
        kind === 'relation' ||
        (kind === 'derived' && derivedInput(declared) === 'relation'))
    ) {
      refuse(
        `edit.${column}: an addon's collection has no relation or image field`
      )
      continue
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
        !accept.every((type) => IMAGE_TYPES.includes(type as CrudImageType))
      ) {
        refuse(
          `edit.${column}: 'accept' must list image types out of ${IMAGE_TYPES.join(', ')}`
        )
      }
      if (!Number.isInteger(maxBytes) || (maxBytes as number) <= 0) {
        refuse(`edit.${column}: 'maxBytes' must be a positive whole number`)
      }
      const keyLength = `crud/${name}/${column}/`.length + IMAGE_KEY_TAIL
      if (declared.maxLength !== undefined && declared.maxLength < keyLength) {
        refuse(
          `edit.${column}: an image key is up to ${keyLength} characters and the column holds ${declared.maxLength}`
        )
      }
      field.image = {
        bucket: String(bucket),
        accept: Array.isArray(accept) ? (accept as CrudImageType[]) : [],
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
  const editedColumns = editable.filter((name) => !(tags && name === TAGS))

  const actions: CrudModelAction[] = []
  if (entry.actions !== undefined && !isRecord(entry.actions)) {
    refuse(`'actions' must map names to actions`)
  }
  for (const [action, raw] of Object.entries(
    input.addon && isRecord(entry.actions) ? entry.actions : {}
  )) {
    if (!ACTION_NAME.test(action) || RESERVED_ACTIONS.includes(action)) {
      refuse(
        `actions.${action}: name an action in camel case, and not ${RESERVED_ACTIONS.join(', ')}`
      )
      continue
    }
    if (!isRecord(raw) || typeof raw.label !== 'string' || !raw.label.trim()) {
      refuse(`actions.${action} needs a 'label'`)
      continue
    }
    unknown(raw, ACTION_SETTINGS, `actions.${action} setting`)
    if (raw.confirm !== undefined && typeof raw.confirm !== 'string') {
      refuse(`actions.${action}.confirm must be a string`)
    }
    const taken = columnList(raw.input, `actions.${action}.input`)
    for (const column of taken) {
      if (columns[column]!.primaryKey || columns[column]!.inputFalse) {
        refuse(`actions.${action}.input: '${column}' is set by the server`)
      }
    }
    actions.push({
      name: action,
      label: raw.label,
      confirm: typeof raw.confirm === 'string' ? raw.confirm : undefined,
      input: taken,
    })
  }
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
  const checks: CrudModelChecks = {}
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

  const currencyColumn = (field: CrudModelField) =>
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
    ...editedColumns,
    ...fields.flatMap(currencyColumn),
    ...listColumns,
    ...detail,
    ...submitted,
    ...actions.flatMap((action) => action.input),
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

  // An addon's create handler fills what it likes.
  if (create && !input.addon) {
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
    actions,
    tags,
  }
}

const OPT_IN_SETTINGS = [
  'from',
  'create',
  'edit',
  'delete',
  'actions',
  'permissions',
]

/**
 * The app's entry for an addon's collection: the addon's own, checked against
 * the tables it publishes, less what the app switches off, plus the app's
 * checks. Nothing in the entry can add to it.
 */
const optIn = (
  name: string,
  entry: Record<string, unknown>,
  input: BuildCrudModelInput,
  problems: string[]
): CrudModelCollection | undefined => {
  const refuse = (message: string) => {
    problems.push(`${name}: ${message}`)
  }
  const addon = input.addons?.find((a) => a.name === entry.from)
  if (!addon) {
    refuse(
      `'from' is ${JSON.stringify(entry.from)}, and no addon wired under that name runs against this database`
    )
    return undefined
  }
  const published = addon.collections?.[name]
  if (!isRecord(published)) {
    refuse(
      `the '${addon.name}' addon (${addon.package}) publishes no collection '${name}'`
    )
    return undefined
  }
  const found: string[] = []
  const base = buildCollection(
    name,
    published,
    { ...input, tables: addon.tables, addon: true },
    found
  )
  if (!base || found.length > 0) {
    problems.push(
      ...found.map((problem) => `the '${addon.name}' addon: ${problem}`)
    )
    return undefined
  }

  for (const key of Object.keys(entry)) {
    if (!OPT_IN_SETTINGS.includes(key)) {
      refuse(
        `'${key}' cannot be set on an addon's collection: an entry with 'from' only switches things off and adds checks`
      )
    }
  }
  const off = (key: 'create' | 'edit' | 'delete') => {
    if (entry[key] === undefined) return false
    if (entry[key] !== false) {
      refuse(`'${key}' on an addon's collection can only be false`)
    } else if (!base[key]) {
      refuse(`'${key}' switches off an operation the collection does not have`)
    }
    return true
  }
  // Each is checked whether or not the addon has the operation.
  const switchedOff = {
    create: off('create'),
    edit: off('edit'),
    delete: off('delete'),
  }
  const create = base.create && !switchedOff.create
  const edit = base.edit && !switchedOff.edit
  const remove = base.delete && !switchedOff.delete

  const switched = entry.actions ?? {}
  if (!isRecord(switched)) refuse(`'actions' must map actions to false`)
  for (const [action, value] of Object.entries(
    isRecord(switched) ? switched : {}
  )) {
    if (!base.actions.some((a) => a.name === action)) {
      refuse(
        `actions.${action}: the addon's collection has no action of that name`
      )
    } else if (value !== false) {
      refuse(`actions.${action} can only be false`)
    }
  }
  const actions = base.actions.filter(
    (a) => !(isRecord(switched) && switched[a.name] === false)
  )

  const permissions = entry.permissions ?? {}
  const enabled: Record<string, boolean> = {
    read: true,
    create,
    edit,
    delete: remove,
    ...Object.fromEntries(actions.map((a) => [a.name, true])),
  }
  const checks: CrudModelChecks = {}
  if (!isRecord(permissions)) {
    refuse(`'permissions' must map operations to checks`)
  } else {
    for (const [operation, value] of Object.entries(permissions)) {
      const check = parseCheck(value)
      if (!Object.hasOwn(enabled, operation) || !enabled[operation]) {
        refuse(
          `permissions.${operation} checks nothing the collection does here`
        )
      } else if (!check) {
        refuse(
          `permissions.${operation} must be '<module>#<export>', with the module's path from the project root`
        )
      } else {
        checks[operation] = check
      }
    }
  }

  const writes = create || edit
  return {
    ...base,
    from: { name: addon.name, package: addon.package },
    create,
    edit,
    delete: remove,
    actions,
    checks,
    fields: writes ? base.fields : [],
    groups: writes ? base.groups : [],
  }
}

/**
 * Check what one collection says about another: what a relation points at, and
 * what else a delete takes with it.
 */
const checkAcrossCollections = (
  collections: CrudModelCollection[],
  input: BuildCrudModelInput,
  problems: string[]
) => {
  const byName = new Map(collections.map((c) => [c.name, c]))
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (field.input !== 'relation') continue
      const target = byName.get(field.target!)
      const column = collection.columns[field.name]!.references!.column
      if (target?.from) {
        problems.push(
          `${collection.name}: edit.${field.name} points at '${field.target}', which the '${target.from.name}' addon owns. Its table is read by its handlers only, so no relation can search it.`
        )
      } else if (!target) {
        problems.push(
          `${collection.name}: edit.${field.name} points at '${field.target}', which is not a collection. A relation shows its target's titles, behind the target's read.`
        )
      } else if (column !== target.primaryKey) {
        problems.push(
          `${collection.name}: edit.${field.name} references '${field.target}.${column}', and a relation must point at the primary key '${target.primaryKey}'`
        )
      }
    }
    const tables = collection.from
      ? input.addons!.find((a) => a.name === collection.from!.name)!.tables
      : input.tables
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
    // An addon's delete handler is written for what goes with a record.
    if (
      !collection.from &&
      !input.addon &&
      collection.delete &&
      collection.deletesAlso.length > 0
    ) {
      problems.push(
        `${collection.name}: delete is on, but deleting a record would also delete or clear rows of ${collection.deletesAlso.join(', ')} through 'cascade' or 'setNull'`
      )
    }
  }
}

export const buildCrudModel = (input: BuildCrudModelInput): CrudModel => {
  const problems: string[] = []
  const collections: CrudModelCollection[] = []
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
    const owner = input.addons?.find((a) => Object.hasOwn(a.tables, name))
    if (owner && entry.from === undefined) {
      problems.push(
        `${name}: the table belongs to the '${owner.name}' addon, whose rules are in its code. Switch its collection on with { from: '${owner.name}' }.`
      )
      continue
    }
    const collection =
      entry.from === undefined || input.addon
        ? buildCollection(name, entry, input, problems)
        : optIn(name, entry, input, problems)
    if (collection) collections.push(collection)
  }
  if (Object.keys(input.declaration).length === 0) {
    problems.push('it declares no collection')
  }
  if (problems.length === 0) {
    checkAcrossCollections(collections, input, problems)
  }
  if (problems.length === 0) {
    const owners = new Map<string, string>()
    for (const collection of collections) {
      for (const functionName of crudFunctionNames(collection)) {
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
    throw new Error(`db/crud.ts: ${problems.join('; ')}.`)
  }
  return { collections }
}
