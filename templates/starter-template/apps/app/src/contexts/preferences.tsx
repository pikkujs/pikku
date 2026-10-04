import { createContext, useContext } from 'react'

export interface PreferencesContextValue {
  locale: string
  themeId: string
  setLocale: (locale: string) => void
  setThemeId: (themeId: string) => void
}

export const PreferencesContext = createContext<PreferencesContextValue>({
  locale: 'en',
  themeId: 'default',
  setLocale: () => {},
  setThemeId: () => {},
})

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext)
}
