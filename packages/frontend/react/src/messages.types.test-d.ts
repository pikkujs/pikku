/**
 * Compile-time tests, checked by `tsc -p tsconfig.test.json` (part of the
 * build). Every `@ts-expect-error` must stay an error: if one stops being
 * one, tsc reports an unused directive and the build fails.
 */
import { createMessages, completeMessages } from './messages.js'
import type { MessagesOf, MessagesInput, CompleteMessages } from './messages.js'
import { asI18n, asI18nStub, sep } from './i18n-types.js'
import type { I18nString, I18nNode } from './i18n-types.js'

declare const outsideText: string

const defaults = {
  loop: () => 'Loop',
  elif: ({ n }: { n: number }) => `elif ${n}`,
}
type M = MessagesOf<typeof defaults>
const { MessagesProvider, useM, defaultM } = createMessages(defaults)

// Paraglide-style: returns the brand, optional second argument.
declare const branded: I18nString
const paraglideLoop = (_i?: {}, _o?: { locale?: string }) => branded
const paraglideElif = (_i: { n: number }, _o?: { locale?: string }) => branded

// Passing shapes
const okFull: CompleteMessages<M> = { loop: paraglideLoop, elif: paraglideElif }
const okPartial: MessagesInput<M> = { loop: () => asI18n(outsideText) }
const okComplete = completeMessages<CompleteMessages<M>>({
  loop: () => branded,
  elif: ({ n }) => asI18n(outsideText),
})
const s: I18nString = defaultM.elif({ n: 1 })
void MessagesProvider({ messages: okPartial })
void [okFull, okComplete, s]

// Unknown key
// @ts-expect-error not a key of defaults
const unknownKey: MessagesInput<M> = { nope: () => branded }

// Wrong param name
const wrongName: MessagesInput<M> = {
  // @ts-expect-error param is { n: number }
  elif: ({ count }: { count: number }) => branded,
}

// Wrong param type
// @ts-expect-error n must be a number
const wrongType: MessagesInput<M> = { elif: ({ n }: { n: string }) => branded }

// Plain string return
// @ts-expect-error a bare string is not an I18nString
const plain: MessagesInput<M> = { loop: () => 'Loop' }

// Missing key under Complete
// @ts-expect-error elif is missing
const missing: CompleteMessages<M> = { loop: () => branded }
// @ts-expect-error elif is missing
completeMessages<CompleteMessages<M>>({ loop: () => branded })

// Parameterised key called without params
// @ts-expect-error params are required
defaultM.elif()

// useM is typed the same way
// @ts-expect-error unknown key
useM().nope
// @ts-expect-error params are required
useM().elif()

void [unknownKey, wrongName, wrongType, plain, missing]

// asI18n takes a variable of plain string type, never a literal.
declare const plainString: string
declare const holder: { name: string }
const fromVariable: I18nString = asI18n(plainString)
const fromMember: I18nString = asI18n(holder.name)
void [fromVariable, fromMember]

// @ts-expect-error a string literal is copy, not outside data
asI18n('Projects')

const literalConst = 'abc'
// @ts-expect-error a const keeps its literal type
asI18n(literalConst)

declare const unionLiteral: 'a' | 'b'
// @ts-expect-error a union of literals is still copy
asI18n(unionLiteral)

declare const maybeName: { name: string | undefined } | undefined
// @ts-expect-error undefined would be branded as text
asI18n(maybeName?.name)

// asI18nStub is the fixture twin: it takes a literal or a variable, and nothing else.
const stubLiteral: I18nString = asI18nStub('Maya Okafor')
const stubVariable: I18nString = asI18nStub(plainString)
// @ts-expect-error a stub is not a number
asI18nStub(3)
// @ts-expect-error no options argument
asI18nStub('x', { featureFlag: 'demo' })

void [stubLiteral, stubVariable]

// sep brands neutral separators: whitespace, punctuation and symbols, no letters or digits.
const sepDot: I18nString = sep(' · ')
const sepSlash: I18nString = sep('/')
const sepSpace: I18nString = sep(' ')
const sepDash: I18nString = sep('—')
const sepArrow: I18nString = sep('→')
const sepDollar: I18nString = sep('$')
const sepLong: I18nString = sep(' · — / | ( ) … → ✓ ')
const sepNode: I18nNode = sep(' · ')
void [
  sepDot,
  sepSlash,
  sepSpace,
  sepDash,
  sepArrow,
  sepDollar,
  sepLong,
  sepNode,
]

// @ts-expect-error a word is copy
sep('and')
// @ts-expect-error a digit is not a separator
sep('v2')
// @ts-expect-error letters between slashes
sep('a/b')
// @ts-expect-error a leading digit
sep('1.')
// @ts-expect-error empty
sep('')
// @ts-expect-error a plain string cannot be checked
sep(plainString)
// @ts-expect-error a template with a substitution
sep(`${plainString} / `)
// @ts-expect-error one letter at the end of a long separator
sep(' · — / | ( ) … → ✓ x')
// @ts-expect-error a union that includes a word
sep(unionLiteral)
