import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

const DbTable: React.FC = () => {
  return (
    <HeroPanel w={104}>
      <div style={{ padding: '7px 10px', borderBottom: '0.5px solid var(--app-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--app-text-faint)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
        </svg>
        <HeroBar w={46} h={6} c="var(--app-text-dim)" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ padding: '7px 10px', borderBottom: i < 2 ? '0.5px solid var(--app-border)' : undefined }}>
          <HeroBar w={i === 1 ? 56 : 72} h={5} c="var(--app-text-muted)" />
        </div>
      ))}
    </HeroPanel>
  )
}

export const DatabaseHero: React.FC = () => {
  const connColor = 'var(--app-border-strong, var(--app-border))'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <DbTable />
      <span style={{ width: 28, height: 1, background: connColor, position: 'relative', display: 'block' }}>
        <span style={{ position: 'absolute', left: 0, top: -2.5, width: 5, height: 5, borderRadius: '50%', background: connColor }} />
        <span style={{ position: 'absolute', right: 0, top: -2.5, width: 5, height: 5, borderRadius: '50%', background: connColor }} />
      </span>
      <DbTable />
    </div>
  )
}
