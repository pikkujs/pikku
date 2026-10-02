import { type I18nNode } from '@pikku/react'

export function GroupLabel({ children }: { children: I18nNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--app-text-faint)',
        padding: '2px 4px 4px',
        marginTop: 8,
      }}
    >
      {children}
    </div>
  )
}
