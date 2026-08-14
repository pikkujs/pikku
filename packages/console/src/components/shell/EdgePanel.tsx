import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ConsoleChromeContext } from '../../context/ConsoleChromeContext'
import { usePanelInset, type PanelSide } from '../../context/PanelInsetProvider'
import { usePhone } from '../../lib/breakpoints'

/** One card gutter, matching --app-card-gutter in shell/card.module.css. */
export const CARD_GUTTER = 8

/**
 * A surface pinned to one edge of the content column, BESIDE the page rather
 * than over it: it portals into the content area's root and reserves its width
 * there, so the page card shrinks to make room instead of being covered by a
 * scrim. Both of the console's side surfaces are built from this — the screen's
 * list on the start edge, the selection's detail on the end edge — so the two
 * sit in the same card language whichever side they open on.
 *
 * On a phone there is no room to sit beside anything, so it takes the whole
 * content area and reserves nothing.
 */
export function EdgePanel({
  opened,
  side,
  width,
  role,
  testId,
  children,
}: {
  opened: boolean
  side: PanelSide
  width: number
  role?: string
  testId?: string
  /** The panel's own card. Rendered under `self` chrome — see below. */
  children: ReactNode
}) {
  const id = useId()
  const { reserve } = usePanelInset()
  const isMobile = usePhone()
  // The panel's card gutter overlaps the page's, so reserve one gutter less.
  useEffect(() => {
    reserve(id, opened && !isMobile ? width - CARD_GUTTER : null, side)
    return () => reserve(id, null, side)
  }, [id, opened, width, isMobile, side, reserve])

  // The portal root is mounted by the layout, so it only exists after the first
  // paint — resolve it in an effect rather than during render.
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>('#console-content-portal-root')
    )
  }, [opened])

  if (!opened) return null

  const panel = (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side === 'end' ? 'insetInlineEnd' : 'insetInlineStart']: 0,
        width: isMobile ? '100%' : width,
        maxWidth: '100%',
        display: 'flex',
        // The portal root is pointer-events:none so the page stays clickable
        // around the panel; the panel itself takes its clicks back.
        pointerEvents: 'auto',
        zIndex: 3,
      }}
      role={role}
      data-testid={testId}
    >
      {/* The panel is its OWN card. It portals out of the page but not out of
          React context, so without this it would inherit the screen's `host`
          chrome — where a card is deliberately not drawn because one already
          surrounds it — and render as a flush block on the canvas. */}
      <ConsoleChromeContext.Provider value="self">
        {children}
      </ConsoleChromeContext.Provider>
    </div>
  )

  return target ? createPortal(panel, target) : null
}
