import { type ReactNode } from 'react'
import { MantineProvider, type MantineThemeOverride } from '@mantine/core'

// ─────────────────────────────────────────────────────────────────────────────
// The design app's own shell renders under the console theme (so it matches the
// console). Each component preview, however, must render under the USER's theme.
// PreviewProvider is the boundary: a nested MantineProvider whose CSS variables
// are scoped to a wrapper class, so the user palette applies ONLY inside the
// preview and never leaks out to re-colour the surrounding console chrome.
//
// `getRootElement` is pinned to the wrapper element (not <html>) so Mantine sets
// the colour-scheme attribute locally; `cssVariablesSelector` emits the user
// theme's variables under the same scoped class. All previews share one scope
// class — same user theme, so one variable block styles them all.
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_SCOPE = 'pikku-preview-scope'

export function PreviewProvider({
  theme,
  colorScheme,
  children,
}: {
  theme: MantineThemeOverride
  colorScheme: 'light' | 'dark'
  children: ReactNode
}) {
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={colorScheme}
      cssVariablesSelector={`.${PREVIEW_SCOPE}`}
      getRootElement={() => document.querySelector<HTMLElement>(`.${PREVIEW_SCOPE}`) ?? undefined}
      withGlobalClasses={false}
    >
      <div className={PREVIEW_SCOPE} data-mantine-color-scheme={colorScheme}>
        {children}
      </div>
    </MantineProvider>
  )
}
