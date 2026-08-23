import type React from 'react'
import type { I18nString } from '@pikku/react'

/**
 * The dock's vocabulary — the shapes the renderer draws, with no opinion about
 * where the entries come from.
 *
 * A console builds its own zones (see `ConsoleNavDock`) and an embedding app
 * builds different ones from its own routes and data; both hand the same shapes
 * to {@link NavDock}. Keeping the model here is what lets the two look identical
 * without sharing a router, a query client, or a navigation scheme.
 */

/** Never inferred from a name — `preview/142` and a stage someone called
 *  `prod-2` would both guess wrong. It comes off the thing's declared type. */
export type DockEnv = 'prod' | 'staging' | 'preview'

export type IconComponent = React.ComponentType<{
  size?: number
  className?: string
  strokeWidth?: number
}>

export interface DockBadge {
  kind: 'dot' | 'count' | 'busy'
  text?: string
  tone: 'error' | 'warn' | 'accent'
}

export interface FlyoutRow {
  key: string
  Icon: IconComponent
  label: I18nString
  meta?: I18nString
  tone?: 'error' | 'warn'
  status?: 'ok' | 'warn' | 'error' | 'busy'
  env?: DockEnv
  badge?: { text: string; tone?: 'error' | 'warn' | 'accent' }
  hint?: string
  danger?: boolean
  /** Makes the row a setting rather than a destination: it draws a tick when the
   *  option it applies is the one in force. Present-but-false still means "this
   *  is a setting", so the tick column stays aligned down the menu. */
  checked?: boolean
  /** Whether the setting is one of a set of alternatives (a radio) or a switch
   *  of its own (a checkbox) — which is what a screen reader announces. */
  exclusive?: boolean
  /** A continuous setting rather than a choice between named ones: the row
   *  draws a slider under its label and reports the live value as its hint. It
   *  never closes the menu — you are dragging towards an answer, not picking
   *  one. */
  slider?: {
    value: number
    min: number
    max: number
    step: number
    /** How the live value reads in the row's hint (e.g. `120%`). */
    format?: (value: number) => string
    onChange: (value: number) => void
  }
  /** Child rows, drawn as a submenu. A row with children has no action of its
   *  own — opening it IS the action — so `onSelect` is ignored. */
  rows?: FlyoutRow[]
  /** Opaque tokens meaning "this row is the page you are already on". The dock
   *  never reads them itself — the `isActive` it is given decides what a token
   *  means, so one app can match on a route id and another on a path prefix. */
  match?: string[]
  onSelect?: () => void
}

export interface FlyoutSection {
  key: string
  title?: I18nString
  rows: FlyoutRow[]
  /** Shown instead of the rows when the section is genuinely empty. */
  empty?: I18nString
}

export interface DockMenu {
  label: I18nString
  head?: { mark: string; title: I18nString; sub: I18nString; chip?: I18nString }
  sections: FlyoutSection[]
}

export interface DockTile {
  id: string
  label: I18nString
  Icon?: IconComponent
  /** The tile draws its own thing instead of a glyph (identity mark, avatar). */
  render?: 'switcher' | 'account'
  /** The letters an `account` tile draws in its avatar. */
  initials?: string
  /** Glyphs whose shapes close cleanly enough to carry the duotone active fill.
   *  A fill on an open path renders as a smear, so this opts in per icon. */
  fill?: boolean
  shortcut?: string
  primary?: boolean
  /** Tokens that make this the current tile — see {@link FlyoutRow.match}. */
  match?: string[]
  /** A plain click navigates. Absent on tiles whose whole content is a menu. */
  onSelect?: () => void
  menu?: DockMenu
  /** Draws the submenu caret. A menu built from a tile's own children. */
  isGroup?: boolean
  badge?: DockBadge
  env?: DockEnv
}

export type DockEntry = DockTile | { sep: true; key: string }

export const isSep = (e: DockEntry): e is { sep: true; key: string } =>
  'sep' in e
