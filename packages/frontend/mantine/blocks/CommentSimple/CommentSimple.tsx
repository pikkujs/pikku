import type { I18nString } from '@pikku/react'
import { Avatar, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@/i18n/messages'

export type CommentSimpleProps = {
  // A single comment's author, timestamp and body are opaque data (not UI copy)
  // — a real app passes them via asI18n(...); avatar is a plain URL string.
  author?: I18nString
  postedAt?: I18nString
  body?: I18nString
  avatar?: string
}

export function CommentSimple({
  author = asI18n('Jacob Warnhalter'),
  postedAt = asI18n('10 minutes ago'),
  body = asI18n(
    'This Pokémon likes to lick its palms that are sweetened by being soaked in honey. Teddiursa concocts its own honey by blending fruits and pollen collected by Beedrill.',
  ),
  avatar = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png',
}: CommentSimpleProps = {}) {
  return (
    <div>
      <Group>
        <Avatar src={avatar} alt={author} radius="xl" />
        <div>
          <Text size="sm">{author}</Text>
          <Text size="xs" c="dimmed">
            {postedAt}
          </Text>
        </div>
      </Group>
      <Text pl={54} pt="sm" size="sm">
        {body}
      </Text>
    </div>
  )
}
