import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { I18nString } from '@pikku/react'
import { usePageOptions } from '../../context/PageOptionsProvider'

/**
 * Declares this page's options rail as the phone's Options sheet. Render it
 * INSTEAD of the in-page rail when the viewport is a phone:
 *
 *     {phone ? <PageOptionsPortal>{rail}</PageOptionsPortal> : <RailColumn>{rail}</RailColumn>}
 *
 * The children keep re-rendering from the page as normal — they are only
 * relocated, not copied — so rail state (which row is selected) stays where the
 * page owns it. Mounting flips the Options tab on in MobileTabBar; unmounting
 * (navigating away, or growing past the phone breakpoint) flips it back off, so
 * the tab can never point at a rail that is no longer on screen.
 *
 * `label` names the tab after what the rail actually holds ("Files") instead of
 * the generic "Options"; omit it for a rail of mixed choices.
 */
export function PageOptionsPortal({
  children,
  label,
}: {
  children: React.ReactNode
  label?: I18nString
}) {
  const { host, setHasOptions, setLabel, setOpen } = usePageOptions()

  useEffect(() => {
    setHasOptions(true)
    setLabel(label ?? null)
    return () => {
      setHasOptions(false)
      setLabel(null)
      // A sheet left open over a page that no longer has options would be an
      // empty sheet with no way to explain itself.
      setOpen(false)
    }
  }, [label, setHasOptions, setLabel, setOpen])

  if (!host) return null
  return createPortal(children, host)
}
