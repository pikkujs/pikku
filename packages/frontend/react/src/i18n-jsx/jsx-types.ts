import type * as React from 'react'
import type { I18nNode, I18nString } from '../i18n-types.js'

/** Attributes whose value is shown to a person (or read out by a screen reader). */
type TextAttr =
  | 'title'
  | 'placeholder'
  | 'alt'
  | 'label'
  | 'aria-label'
  | 'aria-description'
  | 'aria-placeholder'
  | 'aria-roledescription'
  | 'aria-valuetext'

/** Same props, but text children and text attributes must be `I18nString`. Everything else is untouched. */
type Gate<P> = {
  [K in keyof P]: K extends 'children'
    ? I18nNode
    : K extends TextAttr
      ? I18nString | Exclude<P[K], string>
      : P[K]
}

/** React's JSX namespace with the intrinsic (DOM and SVG) elements gated. Components keep their own prop types. */
export namespace JSX {
  export type ElementType = React.JSX.ElementType
  export interface Element extends React.JSX.Element {}
  export interface ElementClass extends React.JSX.ElementClass {}
  export interface ElementAttributesProperty
    extends React.JSX.ElementAttributesProperty {}
  export interface ElementChildrenAttribute
    extends React.JSX.ElementChildrenAttribute {}
  export type LibraryManagedAttributes<C, P> =
    React.JSX.LibraryManagedAttributes<C, P>
  export interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
  export interface IntrinsicClassAttributes<T> extends React.JSX
    .IntrinsicClassAttributes<T> {}
  export type IntrinsicElements = {
    [E in keyof React.JSX.IntrinsicElements]: Gate<
      React.JSX.IntrinsicElements[E]
    >
  }
}
