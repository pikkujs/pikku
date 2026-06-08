import React from 'react'
import { HeroPanel } from './HeroPanel'
import { HeroBar } from './HeroBar'

export const TestsHero: React.FC = () => {
  const STATUS = { pass: 'var(--app-green)', work: 'var(--app-amber)', fail: 'var(--app-red)' }
  const rows: Array<{ s: 'pass' | 'work' | 'fail'; w: number }> = [{ s: 'pass', w: 116 }, { s: 'work', w: 92 }, { s: 'fail', w: 104 }]
  const icons = { pass: 'M20 6 9 17l-5-5', work: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2', fail: 'M18 6 6 18M6 6l12 12' }
  return (
    <HeroPanel w={264}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px',
        borderBottom: '0.5px solid var(--app-border)' }}>
        <HeroBar w={70} h={7} c="var(--app-text-dim)" />
        <span style={{ display: 'flex', gap: 5 }}>
          {(['pass', 'work', 'fail'] as const).map(s => (
            <span key={s} style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[s] }} />
          ))}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
          borderBottom: i < rows.length - 1 ? '0.5px solid var(--app-border)' : undefined }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: `color-mix(in srgb, ${STATUS[r.s]} 16%, transparent)` }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
              stroke={STATUS[r.s]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d={icons[r.s]} />
            </svg>
          </span>
          <HeroBar w={r.w} h={7} c="var(--app-text-muted)" />
        </div>
      ))}
    </HeroPanel>
  )
}
