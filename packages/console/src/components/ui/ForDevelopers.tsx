import React, { useState } from 'react'
import {
  Collapse,
  Paper,
  Stack,
  Text,
  UnstyledButton,
  Group,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/** Technical detail an owner does not need, folded away behind one line. */
export const ForDevelopers: React.FC<{
  label: I18nNode
  children: React.ReactNode
  defaultOpen?: boolean
  icon?: React.ReactNode
  hint?: I18nNode
  testId?: string
  detached?: boolean
}> = ({
  label,
  children,
  defaultOpen = false,
  icon,
  hint,
  testId,
  detached = false,
}) => {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = open ? ChevronDown : ChevronRight
  const body = (
    <Collapse expanded={open}>
      <Stack gap={detached ? 'md' : 'sm'} pt={detached ? 0 : 'sm'}>
        {children}
      </Stack>
    </Collapse>
  )
  const bar = (
    <Paper variant="inset" px="md" py="sm" data-testid={testId}>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        w="100%"
        aria-expanded={open}
        data-testid={testId && `${testId}-toggle`}
      >
        <Group gap={6} wrap="nowrap">
          {icon ?? <Icon size={14} />}
          <Text size="sm" c="dimmed" fw={500}>
            {label}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" ml="auto">
              {hint}
            </Text>
          )}
        </Group>
      </UnstyledButton>
      {!detached && body}
    </Paper>
  )
  if (!detached) return bar
  return (
    <>
      {bar}
      {body}
    </>
  )
}
