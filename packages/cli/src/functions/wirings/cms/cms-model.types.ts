import type { CmsImageType, CmsInputKind, CmsOperation } from '@pikku/core/cms'
import type { ColumnType } from '@pikku/core/db'

/** What a column holds, which decides how it is validated, read and written. */
export type CmsColumnFamily =
  | 'text'
  | 'uuid'
  | 'integer'
  | 'bigint'
  | 'real'
  | 'boolean'
  | 'timestamp'
  | 'json'

export interface CmsColumn {
  name: string
  type: ColumnType
  family: CmsColumnFamily
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

export interface CmsImageSettings {
  bucket: string
  accept: CmsImageType[]
  maxBytes: number
}

export interface CmsModelField {
  name: string
  label: string
  help?: string
  input: CmsInputKind
  image?: CmsImageSettings
  currency?: { column: string } | { code: string }
  /** The collection a relation points at. */
  target?: string
}

export interface CmsCheck {
  /** The module's path from the project root. */
  module: string
  exportName: string
}

export type CmsModelChecks = Partial<Record<CmsOperation, CmsCheck>>

export interface CmsModelCollection {
  /** Also the table's name in `db/tables.ts`, which is its name in queries. */
  name: string
  label: string
  columns: Record<string, CmsColumn>
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
  fields: CmsModelField[]
  checks: CmsModelChecks
  /** Tables whose rows are deleted or cleared along with a record. */
  deletesAlso: string[]
}

export interface CmsModel {
  collections: CmsModelCollection[]
}
