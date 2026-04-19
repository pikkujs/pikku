import React, { useMemo } from 'react'
import { Box } from '@mantine/core'
import { generateCommandHelp } from '@pikku/core/cli'
import type { CLIMeta } from '@pikku/core/cli'

interface HelpSegment {
  text: string
  type?: 'heading' | 'flag' | 'command'
}

const parseHelpText = (helpText: string): HelpSegment[] => {
  const lines = helpText.split('\n')
  const segments: HelpSegment[] = []
  let inCommandSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (
      trimmed === 'Commands:' ||
      trimmed === 'Subcommands:' ||
      trimmed === 'Options:' ||
      line.startsWith('Usage:')
    ) {
      inCommandSection =
        trimmed === 'Commands:' || trimmed === 'Subcommands:'
      segments.push({ text: line + '\n', type: 'heading' })
      continue
    }

    if (inCommandSection && trimmed === '') {
      inCommandSection = false
    }

    if (inCommandSection && line.startsWith('  ')) {
      const match = line.match(/^(\s{2})(\S+)(\s.*)?$/)
      if (match) {
        const [, indent, cmdName, rest] = match
        segments.push({ text: indent })
        segments.push({ text: cmdName, type: 'command' })
        segments.push({ text: (rest || '') + '\n' })
        continue
      }
    }

    const flagMatch = line.match(/^(\s+)(--?\S+(?:,\s*--?\S+)*)(.*)$/)
    if (flagMatch) {
      const [, indent, flags, rest] = flagMatch
      segments.push({ text: indent })
      segments.push({ text: flags, type: 'flag' })
      segments.push({ text: rest + '\n' })
      continue
    }

    segments.push({ text: line + (i < lines.length - 1 ? '\n' : '') })
  }

  return segments
}

interface CliHelpTextProps {
  programId: string
  cliMeta: CLIMeta
  commandPath: string[]
}

export const CliHelpText: React.FunctionComponent<CliHelpTextProps> = ({
  programId,
  cliMeta,
  commandPath,
}) => {
  const segments = useMemo(() => {
    const helpText = generateCommandHelp(programId, cliMeta, commandPath)
    return parseHelpText(helpText)
  }, [programId, cliMeta, commandPath])

  return (
    <Box
      component="pre"
      style={{
        fontFamily: 'var(--mantine-font-family-monospace)',
        fontSize: 'var(--mantine-font-size-sm)',
        lineHeight: 1.6,
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {segments.map((seg, i) =>
        seg.type === 'heading' ? (
          <span
            key={i}
            style={{
              color: 'var(--mantine-color-yellow-5)',
              fontWeight: 600,
            }}
          >
            {seg.text}
          </span>
        ) : seg.type === 'command' ? (
          <span
            key={i}
            style={{ color: 'var(--mantine-color-blue-5)' }}
          >
            {seg.text}
          </span>
        ) : seg.type === 'flag' ? (
          <span
            key={i}
            style={{ color: 'var(--mantine-color-green-5)' }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </Box>
  )
}
