export type Private<T> = T & { readonly __classification__: 'private' }
export type Pii<T> = T & { readonly __classification__: 'pii' }
export type Secret<T> = T & { readonly __classification__: 'secret' }

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
