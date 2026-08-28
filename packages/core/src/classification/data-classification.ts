// knowledge: decisions/internals/core-data-classification-brand-is-an-optional-property.md
export type Private<T> = T & { readonly __classification__?: 'private' }
export type Pii<T> = T & { readonly __classification__?: 'pii' }
export type Secret<T> = T & { readonly __classification__?: 'secret' }

export type Classification = 'public' | 'private' | 'pii' | 'secret'
export type AnonymizeStrategy =
  'fake:email' | 'fake:name' | 'hash' | 'keep' | null

// knowledge: decisions/internals/core-column-form-is-an-axis-of-its-own.md

/**
 * How a column's bytes are represented at rest, as distinct from how sensitive
 * the value is (`Classification`). The two are independent: a token hash is
 * `secret` + `hashed` and must never be encrypted, because the hash *is* the
 * lookup key; a live bearer token is `secret` + `plain` today and should not be.
 *
 * `wrapped` and `sealed` are siblings rather than one being "encrypted": both
 * are ciphertext, and what separates them is who can read it back. Wrapped is
 * symmetric and the application holds the key. Sealed is asymmetric and the
 * application holds only the public half, so it can write the value and never
 * read it. Storing one where the other is expected is silent, permanent data
 * loss, which is why they are not collapsed into a single `encrypted`.
 */
export type ColumnForm = 'plain' | 'hashed' | 'wrapped' | 'sealed'

declare const wrappedBrand: unique symbol
declare const sealedBrand: unique symbol
declare const hashedBrand: unique symbol

/**
 * Ciphertext under a symmetric key the application holds — the output of
 * `envelopeEncrypt`, `wrapDEK` or `envelopeRewrap`.
 *
 * Unlike `Secret<T>` the brand is REQUIRED, so a plain `string` is not
 * assignable and a column declared `form: 'wrapped'` cannot be written with
 * anything but genuine ciphertext. It stays assignable *to* `string`, so it
 * still works as a query operand and serializes normally — the constraint is on
 * construction, not on use.
 */
export type WrappedValue = string & { readonly [wrappedBrand]: true }

/** Ciphertext under a public key whose private half the application does not
 *  hold. Deliberately not assignable to `WrappedValue`: writing one where the
 *  other belongs produces a row nobody can ever open. */
export type SealedValue = string & { readonly [sealedBrand]: true }

/** A one-way digest of a secret input. The brand's job is narrow — stop a *raw*
 *  credential being written into the column that should hold its hash. */
export type HashedValue = string & { readonly [hashedBrand]: true }

export interface ColumnClassification {
  classification: Classification
  anonymize_strategy: AnonymizeStrategy
  /** At-rest representation. Absent means `plain`. */
  form?: ColumnForm
  /**
   * Which key protects this column, for a `wrapped` or `sealed` form. Absent
   * means the deployment's default key.
   *
   * It is a purpose, not a tenant: naming one here says "these columns open
   * together and separately from the rest", so the key that opens notes need
   * not open credentials. The id is stored in the value, so a column that
   * changes key is a rewrap rather than a migration.
   */
  keyId?: string
  description?: string
}

export type ClassificationManifest = {
  version: 1
  tables: Record<string, Record<string, ColumnClassification>>
}
