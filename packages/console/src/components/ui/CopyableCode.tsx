import React from 'react'
import { Box, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { CodeHighlight } from '@mantine/code-highlight'

interface CopyableCodeProps {
  code: string
  label?: I18nNode
  language?: string
}

export const CopyableCode: React.FC<CopyableCodeProps> = ({
  code,
  label,
  language = 'typescript',
}) => {
  return (
    <Box>
      {label && (
        <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb={4}>
          {label}
        </Text>
      )}
      <CodeHighlight
        code={code}
        language={language}
        copyLabel="Copy"
        copiedLabel="Copied"
        // Wrap long lines (e.g. WS URLs) so the snippet never clips off the
        // right edge of a narrow panel instead of relying on a hidden scrollbar.
        styles={{
          pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
          code: { whiteSpace: 'pre-wrap' },
        }}
      />
    </Box>
  )
}
