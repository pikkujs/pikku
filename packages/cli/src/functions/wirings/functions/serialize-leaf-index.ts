/**
 * Generates a leaf's `index.ts`, the file `#pikku/<leaf>` resolves to.
 *
 * The indirection exists because the entry filenames differ per leaf
 * (`pikku-http-types.gen.ts`, `pikku-channel-types.gen.ts`) and are themselves
 * overridable in `pikku.config.json`, so no single `#pikku/*` pattern can reach
 * them by name. One generated re-export per leaf gives every wiring a stable
 * specifier while leaving the entry file wherever the project put it.
 */
export const serializeLeafIndex = (leaf: string, entryImportPath: string) => {
  return `/**
 * Subpath entry — \`#pikku/${leaf}\` resolves here.
 */

export * from '${entryImportPath}'
`
}
