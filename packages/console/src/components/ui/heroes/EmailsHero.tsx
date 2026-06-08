import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

export const EmailsHero: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: 200, height: 96 }}>
      <HeroPanel w={168} style={{ position: 'absolute', left: 16, top: 10, transform: 'rotate(-4deg)', opacity: 0.6, padding: 12 }}>
        <HeroBar w={60} h={7} c="var(--app-text-muted)" />
        <div style={{ height: 7 }} />
        <HeroBar w={120} h={5} c="var(--app-border-strong, var(--app-border))" />
      </HeroPanel>
      <HeroPanel w={172} style={{ position: 'absolute', left: 12, top: 4, padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--app-surface-info)',
            border: '0.5px solid var(--app-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 5L2 7" />
            </svg>
          </span>
          <HeroBar w={64} h={7} c="var(--app-text-dim)" />
        </div>
        <div style={{ height: 11 }} />
        <HeroBar w={140} h={6} c="var(--app-text-muted)" />
        <div style={{ height: 6 }} />
        <HeroBar w={110} h={6} c="var(--app-text-muted)" />
        <div style={{ height: 13 }} />
        <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 6, background: 'var(--app-accent)' }}>
          <HeroBar w={36} h={6} c="#fff" />
        </span>
      </HeroPanel>
    </div>
  )
}
