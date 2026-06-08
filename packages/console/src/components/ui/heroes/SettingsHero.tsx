import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

export const SettingsHero: React.FC = () => {
  return (
    <HeroPanel w={236} style={{ padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--app-surface-info)',
          border: '0.5px solid var(--app-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--app-accent)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3M9 9h.01M9 12h.01M9 15h.01M9 18h.01" />
          </svg>
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <HeroBar w={92} h={7} c="var(--app-text-dim)" />
          <div style={{ height: 7 }} />
          <HeroBar w={60} h={5} c="var(--app-text-muted)" />
        </span>
      </div>
      <div style={{ height: 1, background: 'var(--app-border)', margin: '14px 0' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        {[64, 80, 52].map((w, i) => (
          <span key={i} style={{ padding: '5px 0', flex: w, borderRadius: 6,
            background: 'var(--app-panel-bg-strong, var(--app-panel-bg))', border: '0.5px solid var(--app-border)' }} />
        ))}
      </div>
    </HeroPanel>
  )
}
