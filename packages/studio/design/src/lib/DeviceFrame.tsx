import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ─────────────────────────────────────────────────────────────────────────────
// DeviceFrame — render an option at a phone or tablet size and have it MEAN it.
//
// The obvious version of this is a div with `width: 390px`, and it is wrong in a
// way that is worse than not offering the feature: every responsive prop the
// design skill asks for (`visibleFrom`, `hiddenFrom`, `cols={{ base: 1, md: 3 }}`)
// compiles to a media query, and a media query reads the VIEWPORT, not the box
// its element happens to sit in. Narrowing a div gives you the desktop layout
// squeezed — the mobile branch never runs, so the canvas would report that a
// screen works on a phone precisely when it does not.
//
// An iframe has a viewport of its own, which is why the console's builder preview
// frames its app this way, and why this copies that mechanism rather than its
// markup. Two consequences fall out of the boundary:
//
//   - Stylesheets do not cross it. The parent's <style> / <link> nodes are cloned
//     into the frame's head once, which covers Mantine's own CSS and the app's.
//   - Theme CSS VARIABLES do not cross it either, and unlike the stylesheets they
//     change while you look (the tweak knobs, the light/dark switch). So the
//     caller puts a PreviewProvider INSIDE the portal: Mantine emits its variable
//     block as an element in the React tree, so rendering it here lands it in this
//     document, live.
//
// The size is fixed rather than measured. A device is a screen with a height, and
// pinning it sidesteps the content-height round trip an auto-sizing frame needs —
// a sketch that overflows 844px is a sketch that overflows a phone, which is the
// thing worth seeing.
// ─────────────────────────────────────────────────────────────────────────────

export function DeviceFrame({
  width,
  height,
  radius,
  children,
}: {
  width: number
  height: number
  radius: number
  children: ReactNode
}) {
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [doc, setDoc] = useState<Document | null>(null)

  useEffect(() => {
    const frame = ref.current
    const inner = frame?.contentDocument
    if (!inner) return
    // Written rather than assumed: a same-origin iframe starts with an about:blank
    // document that some browsers only finish populating on a load event, and
    // opening it here gives a body to portal into on this tick.
    inner.open()
    inner.write('<!doctype html><html><head></head><body></body></html>')
    inner.close()
    for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
      inner.head.appendChild(node.cloneNode(true))
    }
    inner.body.style.margin = '0'
    inner.body.style.overflowX = 'hidden'
    setDoc(inner)
  }, [])

  return (
    <iframe
      ref={ref}
      title="device"
      style={{
        width,
        height,
        border: '1px solid var(--app-border)',
        borderRadius: radius,
        background: '#fff',
        display: 'block',
      }}
    >
      {doc && createPortal(children, doc.body)}
    </iframe>
  )
}

/** The two sizes the canvas offers, matching the console's builder preview so a
 *  sketch and the app it becomes are judged at the same widths. */
export const DEVICE_SIZES = {
  tablet: { width: 820, height: 1180, radius: 12 },
  mobile: { width: 390, height: 844, radius: 24 },
} as const

export type DeviceMode = 'desktop' | keyof typeof DEVICE_SIZES
