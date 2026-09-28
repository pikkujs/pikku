import React, { useEffect, useState } from 'react'
import {
  Collapse,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { ChevronDown, ChevronRight, Code2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useDeveloperDetails } from '../../hooks/useDeveloperDetails'

/** Technical detail an owner does not need, folded away behind one line. */
export const ForDevelopers: React.FC<{
  label?: I18nNode
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
  const { shown, setShown } = useDeveloperDetails()
  const [open, setOpen] = useState(defaultOpen || shown)
  useEffect(() => {
    setOpen(defaultOpen || shown)
  }, [shown, defaultOpen])
  const Chevron = open ? ChevronDown : ChevronRight
  const body = (
    <Collapse expanded={open}>
      <Stack gap="md" pt={detached ? 0 : 'md'}>
        {children}
      </Stack>
    </Collapse>
  )
  const bar = (
    <Paper variant="inset" px="md" py="sm" data-testid={testId} data-dev-block>
      <Group gap="sm" wrap="nowrap">
        <UnstyledButton
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid={testId && `${testId}-toggle`}
          flex={1}
          miw={0}
        >
          <Group gap={8} wrap="nowrap">
            <Chevron size={14} />
            {icon ?? <Code2 size={14} />}
            <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
              {label ?? m.dev_label()}
            </Text>
            {hint && (
              <Text size="xs" c="dimmed" truncate visibleFrom="sm" miw={0}>
                {hint}
              </Text>
            )}
          </Group>
        </UnstyledButton>
        {open && (
          <Switch
            size="xs"
            checked={shown}
            onChange={(event) => setShown(event.currentTarget.checked)}
            label={m.dev_always_open()}
            data-testid={testId && `${testId}-always`}
            styles={{ label: { whiteSpace: 'nowrap' } }}
          />
        )}
      </Group>
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
