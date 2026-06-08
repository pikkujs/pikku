import React from 'react'
import { HeroPanel } from './HeroPanel'

export const DesignHero: React.FC = () => {
  const swatches = ['var(--app-accent)', '#0ea5a3', 'var(--app-green)', 'var(--app-amber)', 'var(--app-red)', '#7c6cf0']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <HeroPanel w="auto" style={{ display: 'flex', gap: 8, padding: 10 }}>
        {swatches.map((c, i) => (
          <span key={i} style={{ width: 30, height: 38, borderRadius: 7, background: c,
            boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.10)' }} />
        ))}
      </HeroPanel>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['var(--app-accent)', 'var(--app-panel-bg-strong, var(--app-panel-bg))'] as const).map((bg, i) => (
          <span key={i} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            color: i ? 'var(--app-text-dim)' : '#fff', background: bg,
            border: i ? '0.5px solid var(--app-border)' : 'none' }}>Button</span>
        ))}
      </div>
    </div>
  )
}
