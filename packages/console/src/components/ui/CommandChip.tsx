import React, { useEffect, useRef, useState } from 'react'
import { Box, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Check, Copy } from 'lucide-react'

type CommandChipProps = { cmd: string }

export const CommandChip: React.FC<CommandChipProps> = ({ cmd }) => {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = () => {
    navigator.clipboard?.writeText(cmd)
    setCopied(true)
    timerRef.current = setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Box
      component="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px 8px 13px',
        borderRadius: 8,
        border: `0.5px solid ${hovered ? 'var(--app-border-hover, var(--app-border))' : 'var(--app-border)'}`,
        background: 'var(--app-panel-bg, var(--mantine-color-body))',
        fontFamily:
          "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
        cursor: 'pointer',
        transition: 'border-color 130ms',
        lineHeight: 1,
      }}
    >
      <Text
        span
        c="var(--app-text-faint, var(--mantine-color-dimmed))"
        ff="inherit"
        fz="inherit"
      >
        {asI18n('$')}
      </Text>
      <Text
        span
        c="var(--app-text, var(--mantine-color-text))"
        ff="inherit"
        fz="inherit"
      >
        {asI18n(cmd)}
      </Text>
      <Box
        display="flex"
        style={{
          alignItems: 'center',
          color: copied
            ? 'var(--app-green, var(--mantine-color-green-6))'
            : 'var(--app-text-faint, var(--mantine-color-dimmed))',
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Box>
    </Box>
  )
}
