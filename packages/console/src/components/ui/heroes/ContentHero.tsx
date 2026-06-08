import React from 'react'
import { HeroBar } from './HeroBar'

export const ContentHero: React.FC = () => {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 72, opacity: i === 2 ? 0.55 : 1 }}>
          <div style={{ height: 56, borderRadius: 10, background: 'var(--app-panel-bg)', border: '0.5px solid var(--app-border)',
            boxShadow: 'var(--app-shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
            </svg>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <HeroBar w={48} h={5} c="var(--app-text-muted)" />
          </div>
        </div>
      ))}
    </div>
  )
}
