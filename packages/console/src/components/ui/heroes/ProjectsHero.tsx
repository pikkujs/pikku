import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

export const ProjectsHero: React.FC = () => {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      {[0, 1].map(i => (
        <HeroPanel key={i} w={92} style={{ padding: 12, opacity: i ? 0.6 : 1 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--app-panel-bg-strong, var(--app-panel-bg))',
            border: '0.5px solid var(--app-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <div style={{ height: 12 }} />
          <HeroBar w={56} h={6} c="var(--app-text-dim)" />
          <div style={{ height: 7 }} />
          <HeroBar w={40} h={5} c="var(--app-text-muted)" />
        </HeroPanel>
      ))}
      <div style={{ width: 92, borderRadius: 12, border: '1.5px dashed var(--app-border-strong, var(--app-border))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-text-faint)' }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
    </div>
  )
}
