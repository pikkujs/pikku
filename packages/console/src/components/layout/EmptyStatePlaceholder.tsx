import React, { useState } from 'react'
import { Box, Stack, Text, Button } from '@mantine/core'
import { ExternalLink, Copy, Check } from 'lucide-react'
import classes from '../ui/console.module.css'

interface EmptyStatePlaceholderProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  description?: string
  code?: string
  docsHref: string
}

const CommandChip: React.FC<{ cmd: string }> = ({ cmd }) => {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <Box
      component="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        navigator.clipboard?.writeText(cmd)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px 8px 13px',
        borderRadius: 8,
        border: `0.5px solid ${hovered ? 'var(--app-border-hover, var(--app-border))' : 'var(--app-border)'}`,
        background: 'var(--app-panel-bg, var(--mantine-color-body))',
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
        cursor: 'pointer',
        transition: 'border-color 130ms',
        lineHeight: 1,
      }}
    >
      <Text span c="var(--app-text-faint, var(--mantine-color-dimmed))" ff="inherit" fz="inherit">$</Text>
      <Text span c="var(--app-text, var(--mantine-color-text))" ff="inherit" fz="inherit">{cmd}</Text>
      <Box display="flex" style={{ alignItems: 'center', color: copied ? 'var(--app-green, var(--mantine-color-green-6))' : 'var(--app-text-faint, var(--mantine-color-dimmed))' }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Box>
    </Box>
  )
}

export const EmptyStatePlaceholder: React.FC<EmptyStatePlaceholderProps> = ({
  icon: Icon,
  title,
  description,
  code,
  docsHref,
}) => {
  return (
    <Box className={classes.listSurfaceCard}>
      <Stack
        align="center"
        justify="center"
        gap="md"
        className={classes.emptyState}
        py="xl"
        style={{ minHeight: '60vh' }}
      >
        <Icon size={48} strokeWidth={1} />
        <Text size="xl" fw={600}>
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center" maw={500}>
            {description}
          </Text>
        )}
        {code && <CommandChip cmd={code} />}
        <Button
          component="a"
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          leftSection={<ExternalLink size={16} />}
        >
          Docs
        </Button>
      </Stack>
    </Box>
  )
}
