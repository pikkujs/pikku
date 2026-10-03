// ─────────────────────────────────────────────────────────────────────────────
// Theme bridge — the design shell now owns the Theme drawer, but persistence
// lives in the console (which holds the sandbox socket). So the saved-theme LIST
// flows IN from the console, and edit intents flow OUT to it:
//
//   console → iframe:  { source:'pikku-console', type:'set-themes', themes, activeId }
//   iframe  → console:  { source:'pikku-design', type:'theme-op', op, ... }
//     op: 'save'   → { entry }   persist (create or overwrite) then re-broadcast
//     op: 'select' → { id }      set the active theme
//     op: 'delete' → { id }      remove a saved theme
//
// The live preview re-themes locally (the shell scopes the theme's CSS) — it does NOT wait for a round-trip.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

export type ThemePalette = {
  id: string
  name: string
  css?: string
}

export type ThemesPayload = { themes: ThemePalette[]; activeId: string }

/** Subscribe to the console's saved-theme broadcast. Null until the first post. */
export function useConsoleThemes(): ThemesPayload | null {
  const [payload, setPayload] = useState<ThemesPayload | null>(null)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'pikku-console' || data.type !== 'set-themes') return
      if (Array.isArray(data.themes) && typeof data.activeId === 'string') {
        setPayload({ themes: data.themes as ThemePalette[], activeId: data.activeId })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return payload
}

type ThemeOp =
  | { op: 'save'; entry: ThemePalette }
  | { op: 'select'; id: string }
  | { op: 'delete'; id: string }

/** Send an edit intent to the console (which performs the RPC). */
export function postThemeOp(payload: ThemeOp): void {
  window.parent.postMessage({ source: 'pikku-design', type: 'theme-op', ...payload }, '*')
}
