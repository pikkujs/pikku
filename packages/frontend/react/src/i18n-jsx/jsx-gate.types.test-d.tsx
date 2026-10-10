/** @jsxImportSource @pikku/react/i18n-jsx */
/**
 * Compile-time tests for the DOM-types gate, checked by `tsc -p tsconfig.test.json`. Every `@ts-expect-error`
 * must stay an error: if one stops being one, tsc reports an unused directive and the build fails.
 */
import { asI18n, sep } from '../i18n-types.js'
import type { I18nString } from '../i18n-types.js'
import type { ReactNode } from 'react'

declare const m: () => I18nString
declare const outside: string
declare const cond: boolean
declare const node: ReactNode

// Text children
export const literalChild = (
  // @ts-expect-error a bare string is not an I18nNode
  <p>Hello</p>
)
export const mixedChild = (
  // @ts-expect-error text beside a message is a string child
  <p>text {m()}</p>
)
export const expressionChild = (
  // @ts-expect-error a plain string variable is not translated
  <p>{outside}</p>
)
export const brandedChild = <p>{m()}</p>
export const assertedChild = <p>{asI18n(outside)}</p>
export const numberChild = <p>{3}</p>
export const arrayChild = <ul>{[m(), m()]}</ul>
export const nullChild = <p>{null}</p>
export const conditionalChild = <p>{cond && <b>{m()}</b>}</p>
export const nestedElements = (
  <div>
    <span>{m()}</span>
    <span>{m()}</span>
  </div>
)
export const reactNodeWrapper = (
  // @ts-expect-error a ReactNode may be a string, so it cannot reach a DOM child
  <p>{node}</p>
)

// Text attributes
export const literalPlaceholder = (
  // @ts-expect-error placeholder is shown to a person
  <input placeholder="Search" />
)
export const literalTitle = (
  // @ts-expect-error title is shown to a person
  <button title="Close">{m()}</button>
)
export const literalAriaLabel = (
  // @ts-expect-error aria-label is read out loud
  <button aria-label="Close">{m()}</button>
)
export const literalAlt = (
  // @ts-expect-error alt is read out loud
  <img alt="Logo" />
)
export const brandedAttrs = (
  <input placeholder={m()} title={m()} aria-label={m()} />
)

// Attributes that carry no copy are untouched
export const plainAttrs = (
  <button
    className="primary"
    data-testid="save"
    id="save"
    type="button"
    onClick={() => undefined}
  >
    {m()}
  </button>
)
export const inputValue = <input value="draft" defaultValue="draft" readOnly />

// SVG
export const svg = (
  <svg viewBox="0 0 10 10" className="icon">
    <path d="M0 0L10 10" />
    <text x="0" y="0">
      {m()}
    </text>
  </svg>
)
export const svgLiteral = (
  <svg>
    {/* @ts-expect-error svg text is copy too */}
    <text>Hello</text>
  </svg>
)

// Holes the gate does not close, kept here so a change is deliberate
export const fragmentIsNotGated = <>Hello</>

// Separators: sep() between messages passes, a bare literal does not
export const sepBetweenMessages = (
  <p>
    {m()}
    {sep(' · ')}
    {m()}
  </p>
)
export const sepSlashChild = (
  <p>
    {m()}
    {sep(' / ')}
    {m()}
  </p>
)
export const bareSeparatorChild = (
  // @ts-expect-error a bare separator literal is a string child
  <p>a{' · '}b</p>
)
export const bareSeparatorExpression = (
  // @ts-expect-error even punctuation needs sep()
  <p>
    {m()}
    {' · '}
    {m()}
  </p>
)
