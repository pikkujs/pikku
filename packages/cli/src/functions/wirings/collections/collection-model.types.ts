import type {
  CollectionImageType,
  CollectionInputKind,
} from '@pikku/core/collections'
import type { ColumnType } from '@pikku/core/db'

/** What a column holds, which decides how it is validated, read and written. */
export type CollectionColumnFamily =
  | 'text'
  | 'uuid'
  | 'integer'
  | 'bigint'
  | 'real'
  | 'boolean'
  | 'timestamp'
  | 'json'

export interface CollectionColumn {
  name: string
  type: ColumnType
  family: CollectionColumnFamily
  /** `kind: 'date'` or `kind: 'bool'`, which change the TypeScript type. */
  kind?: string
  nullable: boolean
  hasDefault: boolean
  hasOnUpdate: boolean
  primaryKey: boolean
  security: 'public' | 'private' | 'pii' | 'secret'
  form: 'plain' | 'hashed' | 'wrapped' | 'sealed'
  inputFalse: boolean
  format?: string
  enum?: readonly string[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  references?: { table: string; column: string }
}

export interface CollectionImageSettings {
  bucket: string
  accept: CollectionImageType[]
  maxBytes: number
}

export interface CollectionModelField {
  name: string
  label: string
  help?: string
  input: CollectionInputKind
  image?: CollectionImageSettings
  currency?: { column: string } | { code: string }
  /** The collection a relation points at. */
  target?: string
}

export interface CollectionCheck {
  /** The module's path from the project root. */
  module: string
  exportName: string
}

/** Keyed by operation, and on an addon's collection by action too. */
export type CollectionsModelChecks = Record<string, CollectionCheck>

/** A named change an addon's handler makes. */
export interface CollectionsModelAction {
  name: string
  label: string
  confirm?: string
  /** The columns it takes as input, each optional. */
  input: string[]
}

/** The list of short strings an addon's handlers store, which is no column. */
export interface CollectionsModelTags {
  label: string
  help?: string
  maxItems: number
  maxLength: number
}

/** The wired addon a collection belongs to, whose handlers read and write it. */
export interface CollectionsModelAddon {
  /** The name it is wired under. */
  name: string
  package: string
}

export interface CollectionModel {
  /** Also the table's name in `db/tables.ts`, which is its name in queries. */
  name: string
  label: string
  columns: Record<string, CollectionColumn>
  primaryKey: string
  title: string
  thumbnail?: string
  badge?: string
  /** What a list row carries. */
  listColumns: string[]
  /** What one record carries. */
  readColumns: string[]
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
  create: boolean
  edit: boolean
  delete: boolean
  /** The editable fields, in form order. */
  fields: CollectionModelField[]
  checks: CollectionsModelChecks
  /** Absent for a collection over the app's own table. */
  from?: CollectionsModelAddon
  actions: CollectionsModelAction[]
  tags?: CollectionsModelTags
  /** Tables whose rows are deleted or cleared along with a record. */
  deletesAlso: string[]
}

export interface CollectionsModel {
  collections: CollectionModel[]
}
