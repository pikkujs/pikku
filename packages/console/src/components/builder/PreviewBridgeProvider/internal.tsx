import { createContext } from 'react'
import type { Palette, ThemeSpec } from '../themeModel'
import type { PresenceSelection, InspectMode } from './types.js'

export type PreviewBridge = {
  registerPreviewIframe: (id?: string) => (el: HTMLIFrameElement | null) => void
  previewTheme: (palette: Palette | ThemeSpec | null) => void
  setLibrarySection: (sectionId: string | null) => void
  setSelections: (selections: PresenceSelection[], iframeId?: string) => void
  // The active element-picking intent. 'chat' means picks feed the Pi
  // composer; consumers gate on this so a pick only lands where the user expects.
  inspectMode: InspectMode
  setInspectMode: (mode: InspectMode, iframeId?: string) => void
  subscribeElementSelect: (
    cb: (
      omId: string,
      tag: string,
      rect: DOMRectLike | null,
      component: string,
      omIndex: number | undefined,
    ) => void,
  ) => () => void
  subscribeElementDeselect: (cb: () => void) => () => void
  subscribeI18nOpen: (cb: (key: string) => void) => () => void
  getIframeElement: (id?: string) => HTMLIFrameElement | null
}

export type DOMRectLike = { top: number; left: number; width: number; height: number }

export const noop = () => {}

export const noopUnsub = () => noop

export const PreviewBridgeContext = createContext<PreviewBridge>({
  registerPreviewIframe: () => noop,
  previewTheme: noop,
  setLibrarySection: noop,
  setSelections: noop,
  inspectMode: 'off',
  setInspectMode: noop,
  subscribeElementSelect: noopUnsub,
  subscribeElementDeselect: noopUnsub,
  subscribeI18nOpen: noopUnsub,
  getIframeElement: () => null,
})
