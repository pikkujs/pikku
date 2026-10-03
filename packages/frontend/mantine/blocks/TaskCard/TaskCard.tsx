import { Upload } from 'lucide-react'
import { ActionIcon, Avatar, Badge, Card, Group, Progress, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import { Wordmark } from '@/components/Wordmark'

export type TaskCardProps = {
  // Opaque data — asI18n(...), never translated.
  daysLeft?: I18nString
  title?: I18nString
  description?: I18nString
  completed?: number
  total?: number
  avatars?: string[]
  extraCount?: I18nString
}

export function TaskCard({
  daysLeft = asI18n('12 days left'),
  title = asI18n('5.3 minor release (September 2022)'),
  description = asI18n(
    'Form context management, Switch, Grid and Indicator components improvements, new hook and 10+ other changes',
  ),
  completed = 23,
  total = 36,
  avatars = [
    'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
    'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-4.png',
    'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-7.png',
  ],
  extraCount = asI18n('+5'),
}: TaskCardProps = {}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between">
        <Wordmark name={m.app__name()} />
        <Badge>{daysLeft}</Badge>
      </Group>

      <Text fz="lg" fw={500} mt="md">
        {title}
      </Text>
      <Text fz="sm" c="dimmed" mt={5}>
        {description}
      </Text>

      <Text c="dimmed" fz="sm" mt="md">
        {m.taskcard__tasks_completed()}
        {asI18n(' ')}
        <Text span fw={500} c="bright">
          {asI18n(`${completed}/${total}`)}
        </Text>
      </Text>

      <Progress
        value={(completed / total) * 100}
        mt={5}
        aria-label={m.taskcard__task_completion()}
      />

      <Group justify="space-between" mt="md">
        <Avatar.Group spacing="sm">
          {avatars.map((src, i) => (
            <Avatar key={i} src={src} radius="xl" alt={m.taskcard__avatar_alt({ n: i + 1 })} />
          ))}
          <Avatar radius="xl" alt={m.taskcard__more_users()}>
            {extraCount}
          </Avatar>
        </Avatar.Group>
        <ActionIcon variant="default" size="lg" radius="md" aria-label={m.taskcard__upload()}>
          <Upload size={18} />
        </ActionIcon>
      </Group>
    </Card>
  )
}
