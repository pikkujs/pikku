import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { MantineThemeOverride } from '@mantine/core'
import { activeTheme, buildTheme } from '@project/mantine-themes'

// ─────────────────────────────────────────────────────────────────────────────
// Host bridge — the postMessage protocol between this design server (in an
// iframe) and the console Design tab. Kept identical to the old storyboard so
// the console side is unchanged:
//   console → server:  { source:'pikku-console', type:'set-theme'|'set-section', ... }
//   server  → console:  { source:'pikku-design', type:'ready'|'content-height'|'component-meta' }
//   server  → console:  { source:'pikku-preview', type:'element-select', ... } (Alt+click)
// ─────────────────────────────────────────────────────────────────────────────

/** Live-swappable Mantine theme: starts on the persisted active palette, rebuilds
 *  client-side when the console posts a full palette spec (no iframe reload). */
export function useHostTheme(): MantineThemeOverride {
  const [theme, setTheme] = useState<MantineThemeOverride>(activeTheme)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'pikku-console' || data.type !== 'set-theme') return
      try {
        setTheme(data.palette ? buildTheme(data.palette) : activeTheme)
      } catch (err) {
        console.warn('[design-server] ignoring bad theme payload', err)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return theme
}

/** Active section (library: component title · app: section id), seeded from the URL and updated by `set-section` posts. */
export function useHostSection(initial: string | null): string | null {
  const [section, setSection] = useState<string | null>(initial)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'pikku-console' || data.type !== 'set-section') return
      setSection(typeof data.sectionId === 'string' ? data.sectionId : null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return section
}

/** Tell the console we're mounted and ready to receive posts. */
export function reportReady(): void {
  window.parent.postMessage({ source: 'pikku-design', type: 'ready' }, '*')
}

/** Ask the console to open the builder chat on the `design` agent so the user can
 *  describe an artifact. The agent writes a new `artifacts/<slug>-vN.html`, which
 *  then appears in the nav (file-driven — no other state). */
export function requestDesignAgent(): void {
  window.parent.postMessage({ source: 'pikku-design', type: 'open-design-agent' }, '*')
}

/** Ask the console to delete ONE version of an artifact (artifacts/<file>). The
 *  console owns the sandbox socket, so it runs the deleteArtifact RPC and posts
 *  back an `artifact-deleted` message; the shell reloads to re-read the dir. */
export function requestDeleteArtifact(file: string): void {
  window.parent.postMessage(
    {
      source: 'pikku-design',
      type: 'delete-artifact',
      artifactFile: file,
    },
    '*',
  )
}

/** Ask the console to hand a picked artifact option to the build (`vibe`) agent:
 *  it flips the chat to Build mode and pre-fills an instruction naming the exact
 *  option + source file, so the build agent can match that section in the app. The
 *  page is already on disk in the repo, so the message only needs to carry which
 *  file and which option. */
export function requestAdoptOption(artifactFile: string, objectName: string): void {
  window.parent.postMessage(
    {
      source: 'pikku-design',
      type: 'adopt-option',
      artifactFile,
      objectName,
    },
    '*',
  )
}

/** Ask the console to open the DESIGN conversation on a picked option so the user
 *  can say what to change, without building anything. Picking is not the same as
 *  being finished: the usual case is a user who likes one sketch and wants it
 *  changed before it becomes real. Adopt is one-way (it starts a build, or answers
 *  the planner), so without this the only way to say "this one, but…" is to leave
 *  the canvas and describe the option from memory. The console shows the option as
 *  a chip on the composer rather than typing a message for the user — the
 *  refinement is their sentence, and the agent has nothing to act on until they
 *  write it. Goes to the design agent because it is the one that owns the
 *  artifact and writes the next version of it. */
export function requestRefineOption(artifactFile: string, objectName: string): void {
  window.parent.postMessage(
    {
      source: 'pikku-design',
      type: 'refine-option',
      artifactFile,
      objectName,
    },
    '*',
  )
}

/** Ask the console to hand the BUILD (`vibe`) agent the job of writing story files
 *  for the app's existing components. Library/App are glob-driven — a component
 *  with no `*.stories.tsx` beside it simply is not in them — and story files live
 *  under `apps/*\/src/components/`, which the design agent may not write. So this
 *  is a build-mode request, not a design one. */
export function requestComponentStories(): void {
  window.parent.postMessage({ source: 'pikku-design', type: 'write-stories' }, '*')
}

/** Send the console the full discovered catalog (library + app widgets, grouped)
 *  so it can build its left-menu for every lens without a second round-trip.
 *  Emitted once on ready — discovery is static per Vite glob. */
export function reportCatalog(payload: unknown): void {
  window.parent.postMessage(
    { source: 'pikku-design', type: 'catalog', ...(payload as object) },
    '*',
  )
}

/** Send the console the artifact list (slug + newest file + name — the page itself
 *  stays in here). Re-sent whenever the polled list changes, so the console's nav
 *  shows a file the design agent writes mid-session. */
export function reportArtifacts(artifacts: { id: string; file: string; name: string }[]): void {
  window.parent.postMessage({ source: 'pikku-design', type: 'artifacts', artifacts }, '*')
}

/** Send the console the selected component's metadata (argTypes, tags, and — for
 *  app widgets — its query/mutation inputs) to drive the right-column inspector. */
export function reportComponentMeta(payload: unknown): void {
  window.parent.postMessage(
    {
      source: 'pikku-design',
      type: 'component-meta',
      ...(payload as object),
    },
    '*',
  )
}

/** Report the rendered content height so the console can size the iframe. Uses
 *  the container element (not documentElement) to avoid 100vh ratcheting. */
export function useReportContentHeight(ref: RefObject<HTMLElement | null>, deps: unknown[]): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0]?.contentRect.height ?? 0)
      if (height > 0) {
        window.parent.postMessage(
          { source: 'pikku-design', type: 'content-height', height },
          '*',
        )
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Alt+click any host element → report its source location to the console's
 *  prop inspector, and keep re-reporting its rect so the console's highlight box
 *  follows the element as it reflows (live theme swap, HMR, scroll, resize).
 *  No-op outside an iframe. */
export function useElementSelectBridge(): void {
  useEffect(() => {
    if (window.self === window.top) return
    let lastOmId: string | null = null
    let observedEl: Element | null = null

    // Re-emit the selected element's geometry on layout changes. ResizeObserver
    // is timed by construction to fire after layout commits, regardless of cause
    // (theme rebuild, HMR, content change). documentElement is observed too so a
    // global spacing change that shifts the element's position — without changing
    // its own border-box — still refreshes the rect.
    const ro = new ResizeObserver(() => scheduleReselect())

    function findSelected(): Element | null {
      if (!lastOmId) return null
      return (
        Array.from(document.querySelectorAll('[data-om-id]')).find(
          (e) => (e as HTMLElement).dataset.omId === lastOmId,
        ) ?? null
      )
    }

    // Attach observers only when the tracked node's identity changes (initial
    // click, or HMR swapping the DOM node). observe() fires an initial callback,
    // so re-attaching on every reflow would feed scheduleReselect back into a
    // perpetual rAF loop — keep observation out of the hot path.
    function attach(el: Element) {
      if (el === observedEl) return
      ro.disconnect()
      observedEl = el
      ro.observe(el)
      ro.observe(document.documentElement)
    }

    function postRect(el: Element) {
      const r = el.getBoundingClientRect()
      window.parent.postMessage(
        {
          source: 'pikku-preview',
          type: 'element-select',
          omId: (el as HTMLElement).dataset.omId,
          tag: el.tagName.toLowerCase(),
          component: (el as HTMLElement).dataset.omComponent ?? el.tagName.toLowerCase(),
          rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        },
        '*',
      )
    }

    function emitSelect(el: Element) {
      const omId = (el as HTMLElement).dataset.omId
      if (!omId) return
      lastOmId = omId
      attach(el)
      postRect(el)
    }

    let scheduled = false
    function scheduleReselect() {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        const el = findSelected()
        if (!el) return
        attach(el)
        postRect(el)
      })
    }

    const onClick = (e: MouseEvent) => {
      if (!e.altKey) return
      e.preventDefault()
      // stopImmediatePropagation prevents other capture-phase listeners on window
      // (e.g. React's delegation root) from also firing on this alt+click.
      e.stopImmediatePropagation()
      const el = (e.target as Element).closest('[data-om-id]')
      if (el) emitSelect(el)
    }

    const onDblClick = (e: MouseEvent) => {
      // Double-click on any element with data-om-i18n opens the i18n editor
      // in the console's I18nPanel via i18n-open postMessage.
      const el = (e.target as Element).closest('[data-om-i18n]')
      if (!el) return
      e.preventDefault()
      e.stopImmediatePropagation()
      try {
        const tokens: Record<string, string> = JSON.parse(
          (el as HTMLElement).dataset.omI18n ?? '{}',
        )
        // Prefer inline text (children), then label, then title, then first key.
        const key =
          tokens['children'] ?? tokens['label'] ?? tokens['title'] ?? Object.values(tokens)[0]
        if (key)
          window.parent.postMessage({ source: 'pikku-preview', type: 'i18n-open', key }, '*')
      } catch (error) {
        console.warn('[design-server] unreadable data-om-i18n on double-click:', error)
      }
    }

    function notifyMapUpdated() {
      window.parent.postMessage({ source: 'pikku-preview', type: 'om-i18n-map-updated' }, '*')
    }

    window.addEventListener('click', onClick, { capture: true })
    window.addEventListener('dblclick', onDblClick, { capture: true })
    window.addEventListener('scroll', scheduleReselect, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', scheduleReselect)
    import.meta.hot?.on('vite:afterUpdate', scheduleReselect)
    import.meta.hot?.on('vite:afterUpdate', notifyMapUpdated)
    return () => {
      window.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('dblclick', onDblClick, { capture: true })
      window.removeEventListener('scroll', scheduleReselect, { capture: true })
      window.removeEventListener('resize', scheduleReselect)
      import.meta.hot?.off('vite:afterUpdate', scheduleReselect)
      import.meta.hot?.off('vite:afterUpdate', notifyMapUpdated)
      ro.disconnect()
    }
  }, [])
}

export type DesignView = 'library' | 'app' | 'artifact'

const DESIGN_VIEWS: readonly DesignView[] = ['library', 'app', 'artifact']

export function parseHostParams(): {
  colorScheme: 'light' | 'dark'
  view: DesignView
  section: string | null
  chrome: boolean
} {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('view')
  const view: DesignView = DESIGN_VIEWS.includes(raw as DesignView)
    ? (raw as DesignView)
    : 'artifact'
  return {
    colorScheme: params.get('colorScheme') === 'dark' ? 'dark' : 'light',
    view,
    section: params.get('section'),
    // `chrome=off` hands the nav to the host: the console renders the lens switch
    // and the menu as its OWN left panel card (fed by the `catalog`/`artifacts`
    // posts, driven back by `set-lens`/`set-section`), so this shell renders the
    // detail only. Standalone (`bun dev` on the design server) keeps its own nav.
    chrome: params.get('chrome') !== 'off',
  }
}

/** Re-export so views can keep a stable handle to the persisted theme. */
export { activeTheme }
