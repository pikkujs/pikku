import React from 'react'
import { Box, Text } from '@mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'

interface CopyableCodeProps {
  code: string
  label?: string
  language?: string
}

export const CopyableCode: React.FunctionComponent<CopyableCodeProps> = ({
  code,
  label,
  language = 'typescript',
}) => {
  return (
    <Box>
      {label && (
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
          {label}
        </Text>
      )}
      <CodeHighlight code={code} language={language} copyLabel="Copy" copiedLabel="Copied" />
    </Box>
  )
}
