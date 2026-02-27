import React from 'react'
import { Box, Code, CopyButton, ActionIcon, Tooltip, Text } from '@mantine/core'
import { Copy, Check } from 'lucide-react'

interface CopyableCodeProps {
  code: string
  label?: string
}

export const CopyableCode: React.FunctionComponent<CopyableCodeProps> = ({
  code,
  label,
}) => {
  return (
    <Box>
      {label && (
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
          {label}
        </Text>
      )}
      <Box pos="relative">
        <Code block style={{ paddingRight: 40 }}>
          {code}
        </Code>
        <CopyButton value={code}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'} position="left">
              <ActionIcon
                variant="subtle"
                color={copied ? 'teal' : 'gray'}
                onClick={copy}
                size="sm"
                style={{ position: 'absolute', top: 8, right: 8 }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Box>
    </Box>
  )
}
