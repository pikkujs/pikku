import { Tooltip, UnstyledButton } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { PanelLeftOpen, Sparkles } from 'lucide-react'
import { useLocale } from '@/i18n/config'
import classes from './CollapsiblePanel.module.css'

/**
 * A collapsible side panel — the "collapse to a thin icon bar" affordance, so
 * every panel (nav, inspector, assistant) shares ONE implementation instead of
 * re-inventing it. Two states:
 *
 * - expanded  → a fixed-width flex column that renders `children`; the panel
 *               supplies its own header (and its own collapse control).
 * - collapsed → a thin icon rail with an expand button and optional glyph, so the
 *               panel is always reachable on-screen without any outside chrome.
 *
 * Flow-relative (inset/border via inline-* and an RTL-aware tooltip) so it
 * mirrors in RTL.
 */
export function CollapsiblePanel({
  collapsed,
  onExpand,
  width,
  maxWidth = '100vw',
  expandLabel,
  glyph,
  topAction,
  side = 'start',
  floating = false,
  testId,
  children,
}: {
  collapsed: boolean
  onExpand: () => void
  width: number | string
  maxWidth?: number | string
  expandLabel: I18nString
  /** Icon shown on the collapsed rail. The floating rail defaults to a sparkle;
   *  a panel that isn't the assistant should pass its own. */
  glyph?: React.ReactNode
  /** Control pinned to the TOP of the collapsed floating rail, above the expand
   *  strip — for the one affordance that must survive collapsing (e.g. the brand
   *  mark that opens nav). Widens the rail so it can hold a real button. */
  topAction?: React.ReactNode
  /** Which edge the panel lives on — flips the border and the expand glyph. */
  side?: 'start' | 'end'
  /** Render as a floating card (raised surface + radius + shadow + gutter) that
   *  matches the page's header/body cards, instead of a flat flush column.
   *  Applies to both the expanded body and the collapsed rail. */
  floating?: boolean
  testId?: string
  children: React.ReactNode
}) {
  const { dir } = useLocale()
  const isRtl = dir === 'rtl'
  // Point the tooltip away from the panel edge, toward the content.
  const tooltipPosition =
    side === 'start' ? (isRtl ? 'left' : 'right') : isRtl ? 'right' : 'left'
  // The gutter sits on the panel's outer edge; the inner edge is left to the
  // neighbouring page stack's padding so the seam stays one gutter wide.
  const gutter = side === 'start' ? classes.gutterStart : classes.gutterEnd
  // Signed distance for the slide-in: a panel enters from whichever physical edge
  // it actually occupies, which flips with both `side` and direction.
  const slideStyle = {
    '--panel-slide-from': `${(side === 'start') !== isRtl ? -18 : 18}px`,
  } as React.CSSProperties

  if (collapsed) {
    // Floating: the panel tucks off-screen and leaves a slim raised strip — the
    // same "panel slid off the canvas" feel as the end-edge detail panel, but a
    // touch thicker so it can carry a small glyph. The strip is the grab target
    // (click its edge to pull the panel back); a `topAction`, if given, sits
    // above it as its own button and is NOT part of the grab target.
    if (floating) {
      return (
        <div
          className={[
            classes.slimRail,
            gutter,
            topAction ? classes.slimRailWide : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={slideStyle}
        >
          {topAction ? (
            <div className={classes.slimRailTop}>{topAction}</div>
          ) : null}
          <Tooltip label={expandLabel} position={tooltipPosition}>
            <UnstyledButton
              onClick={onExpand}
              aria-label={expandLabel}
              data-testid={testId ? `${testId}-expand` : undefined}
              className={classes.slimRailExpand}
            >
              {glyph ?? <Sparkles size={16} />}
            </UnstyledButton>
          </Tooltip>
        </div>
      )
    }
    return (
      <div
        className={`${classes.rail} ${side === 'end' ? classes.railEnd : ''}`}
        style={slideStyle}
      >
        <Tooltip label={expandLabel} position={tooltipPosition}>
          <UnstyledButton
            onClick={onExpand}
            aria-label={expandLabel}
            data-testid={testId ? `${testId}-expand` : undefined}
            className={classes.expand}
          >
            <PanelLeftOpen
              size={18}
              style={side === 'end' ? { transform: 'scaleX(-1)' } : undefined}
            />
          </UnstyledButton>
        </Tooltip>
        {glyph ? (
          <span className={classes.glyph} aria-hidden>
            {glyph}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={[
        classes.body,
        floating ? classes.floating : '',
        floating ? gutter : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width, maxWidth, ...slideStyle }}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
