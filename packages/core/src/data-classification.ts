export type Private<T> = T & { readonly __pii__: 'private' }
export type Secret<T> = T & { readonly __pii__: 'secret' }

export type Classification = 'public' | 'private' | 'secret'
export type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null

export interface ColumnClassification {
  classification: Classification
  anonymize_strategy: AnonymizeStrategy
}

export type ClassificationManifest = {
  version: 1
  tables: Record<string, Record<string, ColumnClassification>>
}
