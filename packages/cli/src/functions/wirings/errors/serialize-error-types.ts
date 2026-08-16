/**
 * Generates the error leaf — the file `#pikku/error` resolves to.
 *
 * Unlike the wiring leaves there is nothing project-specific to generate: the
 * catalogue, `PikkuError` and `addError` all come from core as they are. The
 * leaf exists so an application names one door for every Pikku import it makes,
 * rather than reaching past `#pikku` into `@pikku/core` for errors alone.
 */
export const serializeErrorTypes = () => {
  return `/**
 * Error catalogue — \`#pikku/error\` resolves here.
 */

export * from '@pikku/core/errors'
`
}
