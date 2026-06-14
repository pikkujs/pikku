// The `__classification__` marker is OPTIONAL on purpose. A required property
// would make a plain value (e.g. `string`) unassignable to a branded column
// (`Private<string>`), which breaks ordinary Kysely query operands —
// `where('email', '=', someString)`, inserts, and `.set(...)`. Making it
// optional keeps the brand structurally present (so the inspector's PKU910
// output check still detects it) while allowing plain values to flow IN.
// See `findPiiPaths` in @pikku/inspector, which reads the level union-aware.
export type Private<T> = T & { readonly __classification__?: 'private' }
export type Pii<T> = T & { readonly __classification__?: 'pii' }
export type Secret<T> = T & { readonly __classification__?: 'secret' }

export type Classification = 'public' | 'private' | 'pii' | 'secret'
export type AnonymizeStrategy =
  | 'fake:email'
  | 'fake:name'
  | 'hash'
  | 'keep'
  | null

export interface ColumnClassification {
  classification: Classification
  anonymize_strategy: AnonymizeStrategy
  description?: string
}

export type ClassificationManifest = {
  version: 1
  tables: Record<string, Record<string, ColumnClassification>>
}
