import React from 'react'
import {
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import type { VirtualUserDoc } from './virtual-user-model'
import { DispositionBadge, VirtualUserAvatar } from './VirtualUserAvatar'
import {
  problemCount,
  runProblems,
  timeAgo,
  type PersonaLastTry,
} from './run-summary'

const LastVisit: React.FC<{ tried?: PersonaLastTry }> = ({ tried }) => {
  const { locale } = useLocale()
  if (tried?.running) {
    return (
      <Text size="xs" c="blue">
        {m.virtual_users_list_visiting()}
      </Text>
    )
  }
  const last = tried?.last
  if (!last) {
    return (
      <Text size="xs" c="dimmed">
        {m.virtual_users_list_never()}
      </Text>
    )
  }
  const problems = problemCount(runProblems(last))
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed">
        {m.virtual_users_list_visited({
          when: timeAgo(last.finishedAt ?? last.createdAt, locale),
        })}
      </Text>
      {problems > 0 && (
        <Text size="xs" c="orange">
          {plural(
            problems,
            m.virtual_users_last_problems_one,
            m.virtual_users_last_problems_other
          )}
        </Text>
      )}
    </Group>
  )
}

export const VirtualUserList: React.FC<{
  users: VirtualUserDoc[]
  tries: Map<string, PersonaLastTry>
  selectedId?: string
  onSelect: (id: string) => void
}> = ({ users, tries, selectedId, onSelect }) => (
  <ScrollArea h="100%" data-testid="virtual-user-list">
    <Stack gap={8} p="md" data-help="list">
      <Stack gap={4} px={2} pb={4}>
        <Title order={3}>{m.virtual_users_list_title()}</Title>
        <Text size="sm" c="dimmed">
          {m.virtual_users_list_subtitle()}
        </Text>
      </Stack>
      {users.map((user) => {
        const selected = user.id === selectedId
        return (
          <UnstyledButton
            key={user.id}
            w="100%"
            data-selected={selected || undefined}
            onClick={() => onSelect(user.id)}
            data-testid={`virtual-user-nav-${user.id}`}
          >
            <Paper variant={selected ? 'accent' : 'inset'} radius="lg" p={14}>
              <Group gap={14} wrap="nowrap" align="flex-start">
                <VirtualUserAvatar
                  name={user.name}
                  disposition={user.disposition}
                  size={40}
                />
                <Stack gap={4} miw={0} style={{ flex: 1 }}>
                  <Group gap={8} wrap="nowrap">
                    <Text fw={600} lineClamp={1}>
                      {asI18n(user.name)}
                    </Text>
                    <DispositionBadge disposition={user.disposition} />
                  </Group>
                  {user.persona.jobTitle && (
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {asI18n(user.persona.jobTitle)}
                    </Text>
                  )}
                  <LastVisit tried={tries.get(user.id)} />
                </Stack>
              </Group>
            </Paper>
          </UnstyledButton>
        )
      })}
    </Stack>
  </ScrollArea>
)
