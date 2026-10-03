import { recordRawEvent } from './analytics'

/**
 * The `data-analytics-click` listener — sugar over `recordEvent()` for the
 * click-shaped majority and for instrumenting a component whose callbacks you
 * do not own:
 *
 *   <Button data-analytics-click="pricing_cta" data-analytics-meta='{"tier":"pro"}' />
 *
 * Named by **trigger**, so `data-analytics-submit` / `data-analytics-change` can
 * be added later as their own listeners rather than overloading this one.
 *
 * One delegated listener rather than wrapped component callbacks, because
 * **portalled content** — Mantine modals, menus, select dropdowns — renders
 * outside its logical DOM position but still under `document`, so it is covered
 * for free. The trade-off is that ancestor meta merging does not reach it: a
 * portalled element's DOM ancestry is the portal container, not the card it
 * visually sits in. Events fired from portalled surfaces need self-sufficient
 * names.
 */
export function registerAnalyticsClickListener(): () => void {
  const onClick = (e: Event) => {
    // `e.target` is not guaranteed to be an Element (it can be the document, or
    // a text node in some engines); a bare cast means `.closest is not a
    // function` at runtime.
    if (!(e.target instanceof Element)) return

    // `closest()` returns the NEAREST match, so an instrumented button inside an
    // instrumented card reports the button and the card does not fire. That is
    // almost always what you want, which is why ancestor context is merged
    // separately below rather than by firing both.
    const el = e.target.closest<HTMLElement>('[data-analytics-click]')
    if (!el) return

    const name = el.dataset.analyticsClick
    if (!name) return

    // Ancestors contribute context — a container supplies `section=pricing`
    // while the child supplies the action. Nearest wins on a key collision.
    const meta: Record<string, unknown> = {}
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const raw = node.dataset?.analyticsMeta
      if (!raw) continue
      try {
        for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
          if (!(key in meta)) meta[key] = value
        }
      } catch {
        // A malformed attribute is an authoring mistake in one element. It must
        // not take out instrumentation for the rest of the tree.
      }
    }

    recordRawEvent(name, meta)
  }

  // Capture phase is required, not stylistic: a bubble-phase listener on
  // `document` never fires if anything in between calls `stopPropagation()`,
  // which Mantine and React components do in places. Capture runs on the way
  // down and cannot be suppressed.
  document.addEventListener('click', onClick, { capture: true })
  return () => document.removeEventListener('click', onClick, { capture: true })
}
