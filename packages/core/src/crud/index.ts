/**
 * The plain declaration of what the CRUD backend may show and change: data, not code.
 *
 * `db/crud.ts` declares one collection per table, beside `db/tables.ts`. The CLI
 * loads it, checks it against the tables and writes the functions into the
 * project. Nothing here queries a database or renders anything: this module
 * holds the declaration, the description the generated `describeCrud` function
 * answers with, and the contract of the handlers an addon ships.
 */
import type { TablesDeclaration } from '../db/index.js'
import type { CoreUserSession } from '../types/core.types.js'

/** The image types an image field may accept. */
export type CrudImageType =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/avif'

/** What every editable field may say about itself. */
export interface CrudFieldTexts {
  /** Defaults to the column name, humanised. */
  label?: string
  /** A line shown beside the field. */
  help?: string
}

/** A field whose input is derived from its column. */
export type CrudDerivedField = CrudFieldTexts & { input?: undefined }

/** Free text, or the Markdown subset a rich text editor writes. */
export type CrudTextField =
  | 'longtext'
  | 'richtext'
  | (CrudFieldTexts & { input: 'longtext' | 'richtext' })

/** An integer in minor units, with the column or the ISO 4217 code that says which currency. */
export type CrudMoneyField = CrudFieldTexts & {
  input: 'money'
  /** A column of the same table, or a constant such as `'EUR'`. */
  currency: string
}

/** An uploaded image. The column stores a key the server builds, never a URL. */
export type CrudImageField = CrudFieldTexts & {
  input: 'image'
  /** A bucket listed in `content.buckets`. */
  bucket: string
  accept: readonly CrudImageType[]
  /**
   * The largest size an upload URL is issued for, and the largest stored file a
   * record takes.
   */
  maxBytes: number
}

/** A column with `references`, whose target is itself a collection. */
export type CrudRelationField =
  'relation' | (CrudFieldTexts & { input: 'relation' })

/** A list of short strings an addon's handlers store. It is no column, so only an addon's own collections have it. */
export type CrudTagsField =
  | 'tags'
  | (CrudFieldTexts & {
      input: 'tags'
      maxItems?: number
      maxLength?: number
    })

/** Any field declaration. */
export type CrudFieldDeclaration =
  | true
  | CrudDerivedField
  | CrudTextField
  | CrudMoneyField
  | CrudImageField
  | CrudRelationField
  | CrudTagsField

/**
 * A check of the app's own, as `'<module>#<export>'` with the module's path from
 * the project root. It can only narrow what the collection's scopes allow.
 */
export type CrudCheckReference = `${string}#${string}`

/**
 * The app's checks on a collection. `read` guards every function of the
 * collection that returns data, so it must be a `pikkuAuth`.
 */
export interface CrudChecks {
  read?: CrudCheckReference
  create?: CrudCheckReference
  edit?: CrudCheckReference
  delete?: CrudCheckReference
}

/** A named change an addon's handler makes, such as publishing. */
export interface CrudActionDeclaration<Column extends string = string> {
  label: string
  /** Columns the action takes as input, each optional. */
  input?: readonly Column[]
  /** A question to ask before the action runs. */
  confirm?: string
}

type TextColumnType = 'id' | 'key' | 'text' | `string(${number})`

/** A column no collection may name at all. */
type HiddenColumn =
  | { security: 'secret' }
  | { form: 'hashed' | 'wrapped' | 'sealed' }
  | { type: 'json' }
  | { kind: 'json' }

type ServerColumn = { primaryKey: true } | { input: false }

type FieldFor<Column> =
  | true
  | CrudDerivedField
  | (Column extends { type: TextColumnType }
      ? CrudTextField | CrudImageField
      : never)
  | (Column extends { type: 'integer' | 'bigint' } ? CrudMoneyField : never)
  | (Column extends { references: string } ? CrudRelationField : never)

type ShownColumns<Columns> = {
  [Name in keyof Columns]: Columns[Name] extends HiddenColumn ? never : Name
}[keyof Columns] &
  string

type EditableColumns<Columns> = {
  [Name in ShownColumns<Columns>]: Columns[Name &
    keyof Columns] extends ServerColumn
    ? never
    : Name
}[ShownColumns<Columns>]

export interface CrudCollectionShape<Column extends string> {
  label: string
  /** The column that names a record. */
  title: Column
  /** An image column shown beside the title. */
  thumbnail?: Column
  /** A column shown as a record's state. */
  badge?: Column
  list: {
    columns: readonly Column[]
    /** Listed columns a caller may filter on. */
    filter?: readonly Column[]
    /** Listed columns a caller may sort by. */
    sort?: readonly Column[]
    /** Listed text columns a search looks in. */
    search?: readonly Column[]
  }
  /** Read-only columns the record view adds. */
  detail?: readonly Column[]
  /** Columns a visitor filled in: read-only, and shown as untrusted text. */
  submitted?: readonly Column[]
  groups?: readonly {
    label: string
    fields: readonly (Column | 'tags')[]
  }[]
  /** Every `pii` column the collection shows must be named here. */
  pii?: readonly Column[]
  /** Off unless `true`. */
  create?: boolean
  /** Off unless `true`. */
  delete?: boolean
  permissions?: CrudChecks
  /** Addon collections only: each has a handler the addon ships. */
  actions?: Record<string, CrudActionDeclaration<Column>>
}

/** One collection over the table whose columns are `Columns`. The key order of `edit` is the form order. */
export type CrudCollectionDeclaration<Columns = Record<string, unknown>> =
  string extends keyof Columns
    ? CrudCollectionShape<string> & {
        edit?: Record<string, CrudFieldDeclaration>
      }
    : CrudCollectionShape<ShownColumns<Columns>> & {
        edit?: {
          [Name in EditableColumns<Columns>]?: FieldFor<
            Columns[Name & keyof Columns]
          >
        } & { tags?: CrudTagsField }
      }

/**
 * An addon's collection, switched on by the app that wires the addon. It may
 * switch operations and actions off and add checks, never add either.
 */
export interface CrudAddonCollectionDeclaration {
  /** The name the addon is wired under. */
  from: string
  create?: false
  edit?: false
  delete?: false
  actions?: Record<string, false>
  permissions?: CrudChecks & Record<string, CrudCheckReference | undefined>
}

type CrudEntry<
  Tables extends TablesDeclaration,
  Name,
> = string extends keyof Tables
  ? CrudCollectionDeclaration | CrudAddonCollectionDeclaration
  : Name extends keyof Tables
    ? CrudCollectionDeclaration<Tables[Name]['columns']>
    : CrudAddonCollectionDeclaration

/**
 * Declare the CRUD collections of `db/crud.ts`. Name your tables as the type
 * argument and a collection's columns are checked where they are written:
 * `defineCrud<typeof tables>()({ ... })`. A key that names no table
 * of yours switches on an addon's collection, with `from`.
 *
 * Returns the declaration unchanged.
 *
 * @example snippet: crudCollections
 */
export const defineCrud =
  <Tables extends TablesDeclaration = TablesDeclaration>() =>
  <Name extends string>(collections: {
    [Key in Name]: CrudEntry<Tables, Key>
  }): { [Key in Name]: CrudEntry<Tables, Key> } =>
    collections

// ─── What describeCrud answers ───────────────────────────────────────────────

export type CrudOperation = 'read' | 'create' | 'edit' | 'delete'

/** How a screen edits or shows one field. */
export type CrudInputKind =
  | 'text'
  | 'longtext'
  | 'richtext'
  | 'select'
  | 'toggle'
  | 'number'
  | 'datetime'
  | 'date'
  | 'email'
  | 'url'
  | 'money'
  | 'image'
  | 'relation'
  | 'tags'

export interface CrudFieldDescription {
  name: string
  label: string
  input: CrudInputKind
  /** In the form of the operations the caller holds. */
  editable: boolean
  /** A create must give it. */
  required: boolean
  /** It may be cleared with `null`. */
  nullable: boolean
  help?: string
  options?: string[]
  min?: number
  max?: number
  maxLength?: number
  maxItems?: number
  currency?: { column: string } | { code: string }
  accept?: string[]
  maxBytes?: number
  /** The function that issues an upload URL for an image field. */
  uploadFunction?: string
  /** The function that searches a relation's targets, when the caller may read them. */
  optionsFunction?: string
  /** The collection a relation points at. */
  target?: string
  /** A visitor wrote it: render it as text, never as markup. */
  untrusted?: boolean
}

export interface CrudActionDescription {
  name: string
  label: string
  /** The function that runs it. */
  function: string
  input: CrudFieldDescription[]
  confirm?: string
}

export interface CrudCollectionDescription {
  name: string
  label: string
  /** The addon that ships the collection, absent for the app's own. */
  from?: string
  primaryKey: string
  title: string
  thumbnail?: string
  badge?: string
  /** What this caller may do. */
  operations: CrudOperation[]
  /** Function names by operation, only for those in `operations`. */
  functions: {
    list: string
    get: string
    create?: string
    update?: string
    delete?: string
  }
  actions: CrudActionDescription[]
  list: {
    columns: string[]
    filter: string[]
    sort: string[]
    search: string[]
  }
  detail: string[]
  submitted: string[]
  groups: { label: string; fields: string[] }[]
  pii: string[]
  /** Tables whose rows are deleted or cleared along with a record. */
  deletesAlso: string[]
  fields: CrudFieldDescription[]
}

export interface CrudDescription {
  collections: CrudCollectionDescription[]
}

// ─── What an addon's handlers are given ─────────────────────────────────────

export type CrudRecordId = string | number

/** One record as it crosses the handler boundary, keyed by column. */
export type CrudRecord = Record<string, unknown>

/** One filter a caller gave, already checked against the collection's allowlist. */
export interface CrudListCondition {
  column: string
  operator: 'equals' | 'in' | 'gt' | 'gte' | 'lt' | 'lte'
  value: unknown
}

/** A list request, checked and normalised before a handler sees it. Every condition applies. */
export interface CrudListQuery {
  /** Between 1 and 100. */
  limit: number
  offset: number
  conditions: CrudListCondition[]
  sort: { column: string; direction: 'asc' | 'desc' }[]
  search?: string
}

/**
 * One handler of an addon's collection. The input is checked, and the caller's
 * scopes and the app's checks have passed, before it runs. It gets the services
 * the generated function passes it, which are the database and the logger.
 */
export type CrudHandler<Services, Input, Output> = (
  services: Services,
  input: Input,
  session: CoreUserSession | undefined
) => Promise<Output>

/** The handlers of one addon collection: one for every operation and action it declares. */
export interface CrudCollectionHandlers<Services = any> {
  /** Return `limit` records at most, and whether more follow. */
  list: CrudHandler<
    Services,
    CrudListQuery,
    { rows: object[]; hasMore: boolean }
  >
  get: CrudHandler<Services, { id: CrudRecordId }, { row: object }>
  create?: CrudHandler<Services, { values: CrudRecord }, { row: object }>
  update?: CrudHandler<
    Services,
    { id: CrudRecordId; patch: CrudRecord; expectedUpdatedAt?: string },
    { row: object }
  >
  delete?: CrudHandler<Services, { id: CrudRecordId }, { removed: boolean }>
  actions?: Record<
    string,
    CrudHandler<
      Services,
      { id: CrudRecordId; input: CrudRecord },
      { row: object }
    >
  >
}

/** What an addon exports as `crudHandlers` from `<package>/crud`, keyed by collection. */
export type CrudHandlers<Services = any> = Record<
  string,
  CrudCollectionHandlers<Services>
>
