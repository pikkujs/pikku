import React from 'react'
import { ActionIcon, Box, Group, Stack, Title } from '@pikku/mantine/core'
import { X } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { CheckProblemDetail, type CheckProblem } from './ChecksCards'

/** The side panel for one problem the last check found. */
export const CheckProblemPanel: React.FC<{
  problem: CheckProblem
  onClose: () => void
}> = ({ problem, onClose }) => {
  useLocale()
  return (
    <Box
      style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      p="md"
      data-testid="checks-problem-panel"
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Title order={3}>{problem.title()}</Title>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={m.checks_close()}
            onClick={onClose}
            data-testid="checks-problem-close"
          >
            <X size={16} />
          </ActionIcon>
        </Group>
        <CheckProblemDetail problem={problem} />
      </Stack>
    </Box>
  )
}
