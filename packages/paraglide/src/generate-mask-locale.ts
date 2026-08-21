/**
 * Generates the i18n-debug pseudo-locale: a copy of the base catalog with every
 * visible character replaced by a block glyph.
 *
 * `tsc` catches an invalid message and the `@pikku/mantine` `I18nNode` gate
 * catches a raw string literal on a gated prop. Neither sees a hardcoded string
 * in plain JSX, an `aria-label`, an `alt`, a `document.title`, or anything
 * handed to a non-Mantine component. Switch to this locale and every message
 * renders as blocks — whatever is still readable never went through a message.
 *
 * The obvious implementation is a runtime wrapper that walks the `m` namespace
 * and pipes each message through a `mask()`. That walk is exactly what stops a
 * bundler tree-shaking unused messages, it adds a check to every call, and it
 * forces every component to import `m` from the wrapper rather than from
 * Paraglide. Masked text is just text, and rendering different text per locale
 * is what Paraglide already does — so the mask is a locale, written at build
 * time and compiled like any other.
 */

/** The glyph a masked character becomes. Full block: no ascenders, no gaps. */
const BLOCK = '█'

/**
 * Masks one message. `{placeholders}` are left verbatim — they are message
 * inputs rather than copy, and mangling one changes the compiled function's
 * signature. Whitespace is left alone too, so the masked text keeps the shape
 * of the original and a layout bug still looks like a layout bug.
 */
export const maskMessage = (value: string): string =>
  value
    .split(/(\{[^}]*\})/g)
    .map((part) => (part.startsWith('{') ? part : part.replace(/\S/g, BLOCK)))
    .join('')

/**
 * Masks a whole catalog. Keys beginning with `$` are metadata rather than copy
 * and are carried through, as is any non-string value: a message with variants
 * is an object whose shape the compiler reads, and flattening it here would
 * change what compiles rather than what renders.
 */
export const maskCatalog = (
  catalog: Record<string, unknown>
): Record<string, unknown> => {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(catalog)) {
    masked[key] =
      typeof value === 'string' && !key.startsWith('$')
        ? maskMessage(value)
        : value
  }
  return masked
}
