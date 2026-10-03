/**
 * Chrome's deferred install prompt, held for whoever offers the install action.
 *
 * `beforeinstallprompt` fires once, on load, as soon as the browser judges the
 * app installable — long before the account menu that offers the action is
 * mounted. A listener inside that component would therefore miss the only event
 * it cares about on every cold load, so the capture is a module singleton the
 * component subscribes to: one browser-wide fact, so one instance rather than a
 * provider every caller has to be wrapped in.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

let capturing = false

/**
 * Starts listening, and must be called from the app entry rather than left as an
 * import side-effect of this module — the only importer is the account menu,
 * which can be code-split, so registering on import would bring the listener up
 * after the browser had already fired the event.
 */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined' || capturing) return
  capturing = true
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar so the install offer appears in one
    // place — ours — instead of two competing ones.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

/** For `useSyncExternalStore`. Non-null exactly while an install can be offered. */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred
}

/** For `useSyncExternalStore`. */
export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Shows the browser's install dialog. Resolves true if the user accepted.
 *
 * The captured event is single-use — Chrome rejects a second `prompt()` on the
 * same one — so it is dropped whatever the outcome, which also hides the action
 * rather than leaving a control that can no longer do anything.
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  emit()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

const STANDALONE_MODES = [
  'standalone',
  'minimal-ui',
  'fullscreen',
  'window-controls-overlay',
]

/**
 * True when already running as an installed app, in which case nothing should
 * offer to install it. `navigator.standalone` is the iOS-only spelling, and the
 * only one that answers for a home-screen launch on older iOS.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return (
    iosStandalone ||
    STANDALONE_MODES.some(
      (mode) => matchMedia(`(display-mode: ${mode})`).matches
    )
  )
}

/**
 * True on iOS/iPadOS, which never fires `beforeinstallprompt` — installing there
 * is a manual trip through the Share sheet, so the action can only explain the
 * steps rather than perform them. Desktop-class iPads report a Macintosh UA, so
 * touch points are what separates them from a real Mac.
 */
export function isIos(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}
