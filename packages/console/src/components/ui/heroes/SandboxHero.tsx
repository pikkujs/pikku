import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

export const SandboxHero: React.FC = () => {
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
      <HeroPanel w={80} style={{ padding: 10, opacity: 0.55 }}>
        <HeroBar w={52} h={6} c="var(--app-text-dim)" />
        <div style={{ height: 8 }} />
        <HeroBar w={40} h={5} c="var(--app-text-muted)" />
        <div style={{ height: 6 }} />
        <HeroBar w={48} h={5} c="var(--app-text-muted)" />
      </HeroPanel>
      <div style={{ width: 88, borderRadius: 12, border: '1.5px dashed var(--app-border-strong, var(--app-border))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '16px 0', color: 'var(--app-text-faint)' }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 5v1M12 18v1M5 12H4M20 12h-1M6.34 6.34l-.71-.71M18.36 18.36l-.71-.71M18.36 6.34l.71-.71M6.05 18.36l.71-.71" />
        </svg>
        <HeroBar w={48} h={5} c="var(--app-text-faint)" />
      </div>
      <HeroPanel w={80} style={{ padding: 10, opacity: 0.3 }}>
        <HeroBar w={52} h={6} c="var(--app-text-dim)" />
        <div style={{ height: 8 }} />
        <HeroBar w={36} h={5} c="var(--app-text-muted)" />
      </HeroPanel>
    </div>
  )
}
