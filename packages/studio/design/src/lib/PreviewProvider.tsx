import type { ReactNode } from 'react'
import { PREVIEW_SCOPE, scopeThemeCss } from '@/lib/themeCss'

export function PreviewProvider({
  css,
  colorScheme,
  children,
}: {
  css: string
  colorScheme: 'light' | 'dark'
  children: ReactNode
}) {
  return (
    <>
      <style>{scopeThemeCss(css)}</style>
      <div
        className={`${PREVIEW_SCOPE}${colorScheme === 'dark' ? ' dark' : ''}`}
      >
        {children}
      </div>
    </>
  )
}
