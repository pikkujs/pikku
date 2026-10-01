import { type CSSProperties, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// PreviewSurface — the page a rendered component sits on. Every lens renders real
// components with no background of their own, so without this they draw straight
// onto the console-themed page: a dark-theme component on a light page (or any
// component whose own surface is transparent) is unreadable, and a themed screen
// reads as unfinished. This paints the USER theme's body colour behind it, which
// is why it must be used INSIDE PreviewProvider — that is the only scope where
// `--mantine-color-body` resolves to the user's palette rather than the console's.
// ─────────────────────────────────────────────────────────────────────────────

export function PreviewSurface({
  framed = true,
  style,
  children,
}: {
  /** Whether to outline the surface. A lens list needs it — specimens sit on a
   *  flat page, and a body-coloured box on a body-coloured page is invisible.
   *  The artifact canvas does not: the dotted grid already separates the two,
   *  and there the object IS the page the screen would sit on, not a card. */
  framed?: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--mantine-color-body)',
        color: 'var(--mantine-color-text)',
        borderRadius: 12,
        padding: 12,
        border: framed ? '1px solid var(--mantine-color-default-border)' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
