import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Avatar, Button, Card, Group, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './UserCardImage.module.css'

type UserCardImageProps = {
  // The user — opaque data, passed via asI18n(...), never translated.
  name?: I18nString
  // Avatar and cover image URLs.
  image?: string
  cover?: string
  onFollow?: () => void
}

export const UserCardImage: FC<UserCardImageProps> = ({
  name = asI18n('Bill Headbanger'),
  image = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-9.png',
  cover = 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80',
  onFollow,
}) => {
  // Sample metric values are opaque data (asI18n); their labels are UI copy (m.*).
  const stats = [
    { value: asI18n('34K'), label: m.usercardimage__followers() },
    { value: asI18n('187'), label: m.usercardimage__follows() },
    { value: asI18n('1.6K'), label: m.usercardimage__posts() },
  ]

  const items = stats.map((stat) => (
    <div key={stat.label}>
      <Text ta="center" fz="lg" fw={500}>
        {stat.value}
      </Text>
      <Text ta="center" fz="sm" c="dimmed" lh={1}>
        {stat.label}
      </Text>
    </div>
  ))

  return (
    <Card withBorder padding="xl" radius="md" className={classes.card}>
      <Card.Section h={140} style={{ backgroundImage: `url(${cover})` }} />
      <Avatar
        src={image}
        size={80}
        radius={80}
        mx="auto"
        mt={-30}
        className={classes.avatar}
        name={name}
      />
      <Text ta="center" fz="lg" fw={500} mt="sm">
        {name}
      </Text>
      <Text ta="center" fz="sm" c="dimmed">
        {m.usercardimage__role()}
      </Text>
      <Group mt="md" justify="center" gap={30}>
        {items}
      </Group>
      <Button fullWidth radius="md" mt="xl" size="md" variant="default" onClick={onFollow}>
        {m.usercardimage__follow()}
      </Button>
    </Card>
  )
}
