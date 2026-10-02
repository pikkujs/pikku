import { Button, Text } from '@pikku/mantine/core'
import { ArrowRight } from 'lucide-react'
import { WovenMark } from './WovenMark'
import { m } from '@/i18n/messages'
import { usePhone } from '../../lib/breakpoints'

/* ============================== bottom bar ============================== */
export function WeaveBar({ count, onOpenApp }: { count: number; onOpenApp?: () => void }) {
  // On a phone the field is the whole screen, so this stops being a card floating
  // under it and becomes a bar attached to its bottom edge — no gutter, no radius,
  // no shadow, just a hairline dividing it from the field above.
  const phone = usePhone()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        width: '100%',
        flexShrink: 0,
        padding: phone ? '12px 16px' : '14px 20px',
        background: 'var(--app-panel-bg)',
        borderRadius: phone ? 0 : 14,
        border: phone ? undefined : '0.5px solid var(--app-border)',
        borderTop: phone ? '0.5px solid var(--app-border)' : undefined,
        boxShadow: phone ? undefined : 'var(--app-shadow-sm)',
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 11,
          background: 'var(--app-panel-bg-soft)',
          border: '0.5px solid var(--app-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <WovenMark size={22} variant="flow" weave="var(--app-primary-button-bg)" />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={700} c="var(--app-text)" style={{ letterSpacing: '-0.01em' }}>
          {m.weaving_title()}
        </Text>
        <Text size="xs" c="var(--app-text-faint)">
          {m.weaving_pieces({ count })}
        </Text>
      </div>
      {/* Always enabled: the app-built detection was unreliable (it often never
          flipped, or needed a refresh), so "Go to app" is just a plain link to
          the running app — click through whenever you like. */}
      <Button
        onClick={onOpenApp}
        rightSection={<ArrowRight size={15} />}
        color="dark"
        radius="md"
        style={{ flexShrink: 0 }}
      >
        {m.weaving_open_app()}
      </Button>
    </div>
  )
}
