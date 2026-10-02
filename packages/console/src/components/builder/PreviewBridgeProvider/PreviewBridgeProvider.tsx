import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Palette, ThemeSpec } from '../themeModel'
import type { PresenceSelection, InspectMode } from './types.js'
import { PreviewBridge, DOMRectLike, noop, noopUnsub, PreviewBridgeContext } from './internal.js'
import { LIBRARY_IFRAME_ID, BUILDER_PREVIEW_IFRAME_ID } from './constants.js'

type SetThemeMessage = {
  source: 'fabric-console'
  type: 'set-theme'
  // The app root accepts a full ThemeSpec (preferred — carries brand colors) or
  // a legacy Palette under this key.
  palette: Palette | ThemeSpec | null
}

type SetSectionMessage = {
  source: 'fabric-console'
  type: 'set-section'
  sectionId: string | null
}

type SetSelectionsMessage = {
  source: 'fabric-console'
  type: 'set-selections'
  selections: PresenceSelection[]
}

// The preview only understands these three; 'chat' is a console-side intent.
type PreviewInspectMode = 'off' | 'design' | 'i18n'

type SetInspectModeMessage = {
  source: 'fabric-console'
  type: 'set-inspect-mode'
  mode: PreviewInspectMode
}

type Props = { children: React.ReactNode }

// Bridges the chat pane (where the theme card lives) to the preview iframe, which
// is a sibling pane and cross-origin. The mounted preview registers its iframe
// here; the card replays a palette spec into it via postMessage so a proposed
// palette renders instantly — no reload, no dependency on the app having loaded
// the palette's file. A null palette resets the iframe to its persisted theme.
// Also receives element-select events from the preview (Alt+Click) so the chat
// composer can be pre-filled with the clicked element's source location.
export const PreviewBridgeProvider: React.FC<Props> = ({ children }) => {
  const iframeRefs = useRef(new Map<string, HTMLIFrameElement>())
  const elementSelectListeners = useRef(
    new Set<
      (
        omId: string,
        tag: string,
        rect: DOMRectLike | null,
        component: string,
        omIndex: number | undefined,
      ) => void
    >(),
  )
  const elementDeselectListeners = useRef(new Set<() => void>())
  const i18nOpenListeners = useRef(new Set<(key: string) => void>())
  const [inspectMode, setInspectModeState] = useState<InspectMode>('off')

  const registerPreviewIframe = useCallback(
    (id = 'default') =>
      (el: HTMLIFrameElement | null) => {
        if (el) iframeRefs.current.set(id, el)
        else iframeRefs.current.delete(id)
      },
    [],
  )

  const previewTheme = useCallback((palette: Palette | ThemeSpec | null) => {
    const message: SetThemeMessage = { source: 'fabric-console', type: 'set-theme', palette }
    for (const frame of iframeRefs.current.values()) {
      frame.contentWindow?.postMessage(message, '*')
    }
  }, [])

  const setLibrarySection = useCallback((sectionId: string | null) => {
    const frame = iframeRefs.current.get(LIBRARY_IFRAME_ID)
    if (!frame?.contentWindow) return
    const message: SetSectionMessage = { source: 'fabric-console', type: 'set-section', sectionId }
    frame.contentWindow.postMessage(message, '*')
  }, [])

  const setSelections = useCallback(
    (selections: PresenceSelection[], iframeId = BUILDER_PREVIEW_IFRAME_ID) => {
      const frame = iframeRefs.current.get(iframeId)
      if (!frame?.contentWindow) return
      const message: SetSelectionsMessage = {
        source: 'fabric-console',
        type: 'set-selections',
        selections,
      }
      frame.contentWindow.postMessage(message, '*')
    },
    [],
  )

  const setInspectMode = useCallback((mode: InspectMode, iframeId = BUILDER_PREVIEW_IFRAME_ID) => {
    setInspectModeState(mode)
    const frame = iframeRefs.current.get(iframeId)
    if (!frame?.contentWindow) return
    const message: SetInspectModeMessage = {
      source: 'fabric-console',
      type: 'set-inspect-mode',
      // 'chat' picks elements just like 'design'; the preview only knows the
      // three pick behaviours, so collapse the intent here.
      mode: mode === 'chat' ? 'design' : mode,
    }
    frame.contentWindow.postMessage(message, '*')
  }, [])

  // Buffer the most recent pick events. A click in the preview often arrives
  // BEFORE the panel it targets has mounted and subscribed (the design/i18n
  // buttons open the panel and the user clicks immediately) — without replay
  // the event is lost and the panel sits empty forever.
  const lastElementSelect = useRef<
    [string, string, DOMRectLike | null, string, number | undefined] | null
  >(null)
  const lastI18nOpen = useRef<string | null>(null)

  const subscribeElementSelect = useCallback(
    (
      cb: (
        omId: string,
        tag: string,
        rect: DOMRectLike | null,
        component: string,
        omIndex: number | undefined,
      ) => void,
    ) => {
      elementSelectListeners.current.add(cb)
      if (lastElementSelect.current) cb(...lastElementSelect.current)
      return () => elementSelectListeners.current.delete(cb)
    },
    [],
  )

  const getIframeElement = useCallback((id = 'default') => iframeRefs.current.get(id) ?? null, [])

  const subscribeElementDeselect = useCallback((cb: () => void) => {
    elementDeselectListeners.current.add(cb)
    return () => elementDeselectListeners.current.delete(cb)
  }, [])

  const subscribeI18nOpen = useCallback((cb: (key: string) => void) => {
    i18nOpenListeners.current.add(cb)
    if (lastI18nOpen.current !== null) cb(lastI18nOpen.current)
    return () => i18nOpenListeners.current.delete(cb)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const { data } = event
      if (data?.source !== 'fabric-preview') return
      if (data.type === 'element-deselect') {
        lastElementSelect.current = null
        for (const cb of elementDeselectListeners.current) cb()
        return
      }
      if (data.type === 'i18n-open') {
        if (typeof data.key === 'string') {
          lastI18nOpen.current = data.key
          for (const cb of i18nOpenListeners.current) cb(data.key)
        }
        return
      }
      if (data.type !== 'element-select') return
      if (typeof data.omId !== 'string') return
      const rect: DOMRectLike | null =
        data.rect &&
        typeof data.rect === 'object' &&
        typeof data.rect.top === 'number' &&
        typeof data.rect.left === 'number' &&
        typeof data.rect.width === 'number' &&
        typeof data.rect.height === 'number'
          ? {
              top: data.rect.top,
              left: data.rect.left,
              width: data.rect.width,
              height: data.rect.height,
            }
          : null
      const component = typeof data.component === 'string' ? data.component : ''
      const omIndex = typeof data.omIndex === 'number' ? data.omIndex : undefined
      const tag = typeof data.tag === 'string' ? data.tag : ''
      lastElementSelect.current = [data.omId, tag, rect, component, omIndex]
      for (const cb of elementSelectListeners.current) cb(data.omId, tag, rect, component, omIndex)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const value = useMemo(
    () => ({
      registerPreviewIframe,
      previewTheme,
      setLibrarySection,
      setSelections,
      inspectMode,
      setInspectMode,
      subscribeElementSelect,
      subscribeElementDeselect,
      subscribeI18nOpen,
      getIframeElement,
    }),
    [
      registerPreviewIframe,
      previewTheme,
      setLibrarySection,
      setSelections,
      inspectMode,
      setInspectMode,
      subscribeElementSelect,
      subscribeElementDeselect,
      subscribeI18nOpen,
      getIframeElement,
    ],
  )

  return <PreviewBridgeContext.Provider value={value}>{children}</PreviewBridgeContext.Provider>
}
