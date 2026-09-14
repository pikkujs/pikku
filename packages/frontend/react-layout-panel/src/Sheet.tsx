import { useEffect, useRef, type FC, type ReactNode } from 'react'

export interface SheetProps {
  opened: boolean
  onClose: () => void
  /** Take the whole height rather than sizing to content — for a long list. */
  fill?: boolean
  /** The sheet's accessible name, given to both the scrim and the dialog. */
  label: string
  testId?: string
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A bottom sheet that stops short of whatever raised it.
 *
 * It deliberately does not cover that control, so tapping it again puts the sheet away
 * and the gesture is symmetric. The edge it stops at is `--shell-sheet-foot`, which is
 * the tab bar unless an ancestor says otherwise — a page whose own controls float above
 * the bar raises the token by their height and keeps the behaviour.
 *
 * `role="dialog" aria-modal` promises a modal, so it behaves like one: focus moves in
 * on open, Tab cycles inside, Escape dismisses, and focus returns to whatever raised it
 * on close.
 */
export const Sheet: FC<SheetProps> = ({
  opened,
  onClose,
  fill,
  label,
  testId,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Read through a ref so an inline `onClose` cannot re-run the effect — and
  // re-focus the sheet — on every render while it is open.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!opened) return
    const dialog = dialogRef.current
    if (!dialog) return

    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    ;(focusables()[0] ?? dialog).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [opened])

  if (!opened) return null
  return (
    <>
      <button
        type="button"
        className="pk-sheet-scrim"
        aria-label={label}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={['pk-sheet', fill ? 'pk-sheet--fill' : '']
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testId}
      >
        <div className="pk-sheet-grip" aria-hidden />
        <div className="pk-sheet-body">{children}</div>
      </div>
    </>
  )
}
