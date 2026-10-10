import type { ReactElement, ReactPortal } from 'react'

/**
 * A string that has been through i18n. Structurally identical to Paraglide JS's
 * `LocalizedString` (`string & { readonly __brand: 'LocalizedString' }`), so a
 * Paraglide `m()` message satisfies this brand — and the `@pikku/mantine` gate —
 * natively, with no wrapper. Also produced by `t()` / `asI18n()`. Compile-time
 * brand only: at runtime this is just a string.
 *
 * The brand is the string literal `'LocalizedString'`, not a `unique symbol`, on
 * purpose: matching Paraglide's public brand is what lets `m()` flow into gated
 * props directly. It still blocks bare `string` (which has no `__brand`), so the
 * gate is unchanged; only deliberately-cast values (`asI18n`) get through. Those
 * are values from outside i18n held in a variable, never literal copy: `asI18n`
 * rejects literals, so the brand keeps meaning "went through the catalogue, or is
 * data we do not own".
 */
export type I18nString = string & { readonly __brand: 'LocalizedString' }

/**
 * Drop-in for `ReactNode` in props that should carry translated text: anything
 * `ReactNode` allows, EXCEPT a bare, unbranded `string`.
 *
 * We use `ReadonlyArray` (not `Iterable`) for the multiple-children case on
 * purpose. A `string` IS structurally an `Iterable<…>` — TypeScript resolves the
 * recursion co-inductively and would let plain strings back in through that
 * backdoor — but a `string` is NOT assignable to a readonly array. So arrays /
 * multiple children pass while bare strings stay blocked.
 */
export type I18nNode =
  | I18nString
  | ReactElement
  | ReactPortal
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<I18nNode>

/**
 * Escape hatch for strings that arrive from outside i18n: server errors, user-typed
 * names, file names, anything the app did not write itself. It takes a variable that
 * already holds such a value (`name`, `project.name`, `a?.b`), never copy: a literal
 * branded here skips the message catalogue, so it would ship untranslated while looking
 * translated. Own copy belongs in a message key, `m.<key>()`.
 *
 * Literal arguments are a compile error. `S extends string` makes TypeScript infer the
 * argument's literal type, and `string extends S` is only true when that type is plain
 * `string`, so `asI18n('Projects')`, a `const` holding a literal and a union of literals
 * all resolve the parameter to `never` and fail. The cost is that
 * `const x = 'abc'; asI18n(x)` fails too, which is the point: that value is copy. Type
 * checking cannot see concatenation, a ternary, a `??` default or a call, all of which
 * type as plain `string`; the verify check `as-i18n-argument` rejects those by syntax, so
 * the argument has to be a bare reference. A template literal written in the argument
 * position is typed as a template type and fails here too; one built elsewhere and held
 * in a `string` variable cannot be seen, so build copy with a message key instead.
 *
 * `null` and `undefined` are not accepted: the brand is a `string`, so a missing value
 * would be branded as text. Narrow first, or branch around the call.
 */
export const asI18n = <S extends string>(
  s: string extends S ? S : never
): I18nString => s as unknown as I18nString

/**
 * Fixture-marker twin of `asI18n`, for made-up sample content whose English we wrote
 * ourselves: the names, notes and labels of a prototype's mock data, before there is a
 * backend or a message key for them. It takes a literal on purpose (`asI18n` rejects
 * literals) and brands it as `I18nString` so the fixture can feed gated props, and so the
 * literal lives once, in the fixture, instead of being wrapped at every use site.
 *
 * It is for fixtures only. Every call is an inventory entry: the `i18n-stub` verify check
 * lists each one, as a warning normally and as an error under strict/release mode, so
 * none can ship. Real outside data (server values, user input) stays `asI18n(variable)`;
 * your own app copy stays a message key, `m.<key>()`. At runtime this is an identity cast,
 * like `asI18n`.
 */
export const asI18nStub = (s: string): I18nString => s as unknown as I18nString

/**
 * The characters `sep` accepts: whitespace, punctuation and symbols that read the same in every
 * language. No letters, no digits. Space, no-break space (U+00A0), narrow no-break space (U+202F),
 * thin space (U+2009), then `. , : ; ! ?  · • – — - / \ | ( ) [ ] { } < > « » “ ” ‘ ’ " ' & + = * # @ % ~ ^ _`,
 * the arrows `→ ← ↑ ↓`, `…`, `✓ ✕ ×` and the currency signs `€ $ £`.
 * `pikku verify` is looser on purpose: it only rejects letters and digits.
 */
export type SepChar =
  | ' '
  | ' '
  | ' '
  | ' '
  | '.'
  | ','
  | ':'
  | ';'
  | '!'
  | '?'
  | '·'
  | '•'
  | '–'
  | '—'
  | '-'
  | '/'
  | '\\'
  | '|'
  | '('
  | ')'
  | '['
  | ']'
  | '{'
  | '}'
  | '<'
  | '>'
  | '«'
  | '»'
  | '“'
  | '”'
  | '‘'
  | '’'
  | '"'
  | "'"
  | '&'
  | '+'
  | '='
  | '*'
  | '#'
  | '@'
  | '%'
  | '~'
  | '^'
  | '_'
  | '→'
  | '←'
  | '↑'
  | '↓'
  | '…'
  | '✓'
  | '✕'
  | '×'
  | '€'
  | '$'
  | '£'

type AllSepChars<S extends string> = S extends `${infer H}${infer R}`
  ? H extends SepChar
    ? R extends ''
      ? true
      : AllSepChars<R>
    : false
  : false

/** `S` itself when it is a non-empty literal made only of `SepChar`s, otherwise `never`. Plain `string` and templates with a substitution resolve to `never`. */
export type OnlyPunct<S extends string> =
  AllSepChars<S> extends true ? S : never

/**
 * A neutral separator between pieces that are already translated: `{m.a()}{sep(' · ')}{m.b()}`,
 * `{sep(' / ')}`, `{sep('—')}`, `{sep(' ')}` between two inline elements. It brands the literal as
 * `I18nString` so the DOM-types gate (`@pikku/react/i18n-jsx`) accepts it, without a catalogue key
 * for something that is not copy.
 *
 * The argument has to be a string literal made only of whitespace, punctuation and symbols:
 * space, no-break space, narrow no-break and thin space, `. , : ; ! ?  · • – — - / \ | ( ) [ ] { } < > « » “ ” ‘ ’ " ' & + = * # @ % ~ ^ _`,
 * `→ ← ↑ ↓ … ✓ ✕ × € $ £` (the `SepChar` type). Letters and digits are rejected, and so are the empty
 * string, a variable of type `string`, and a template literal with a substitution:
 * `sep('and')`, `sep('v2')`, `sep('1.')`, `sep('')`, `sep(name)`, `sep(`${x} / `)` all fail,
 * in the type and in `pikku verify` (`sep-argument`).
 *
 * It is NOT for anything that depends on the language. A comma-joined list, the word "and", an
 * "or" between options, the space French puts before a colon, quote marks that differ per locale:
 * those are a catalogue message, or `Intl.ListFormat` for lists. If the separator could be
 * different in another language, it is not a separator, it is copy. Never words or digits.
 * At runtime this is an identity cast, like `asI18n`.
 */
export const sep = <S extends string>(s: S & OnlyPunct<S>): I18nString =>
  s as unknown as I18nString
