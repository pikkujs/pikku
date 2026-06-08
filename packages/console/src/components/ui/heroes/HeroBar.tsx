import React from 'react'

type HeroBarProps = { w: number; h?: number; c?: string; r?: number }

export const HeroBar: React.FC<HeroBarProps> = ({ w, h = 7, c = 'var(--app-text-muted)', r = 4 }) => {
  return <span style={{ display: 'block', width: w, height: h, borderRadius: r, background: c }} />
}
