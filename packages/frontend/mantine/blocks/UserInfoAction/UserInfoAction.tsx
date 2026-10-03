import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Avatar, Button, Paper, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

type UserInfoActionProps = {
  // The user — opaque data, passed via asI18n(...), never translated.
  name?: I18nString
  email?: I18nString
  // Avatar image URL.
  image?: string
  onSendMessage?: () => void
}

export const UserInfoAction: FC<UserInfoActionProps> = ({
  name = asI18n('Jane Fingerlicker'),
  email = asI18n('jfingerlicker@me.io'),
  image = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-8.png',
  onSendMessage,
}) => {
  return (
    <Paper radius="md" withBorder p="lg" bg="var(--mantine-color-body)">
      <Avatar src={image} size={120} radius={120} mx="auto" name={name} />
      <Text ta="center" fz="lg" fw={500} mt="md">
        {name}
      </Text>
      <Text ta="center" c="dimmed" fz="sm">
        {m.userinfoaction__email_role({ email, role: m.userinfoaction__role() })}
      </Text>

      <Button variant="default" fullWidth mt="md" onClick={onSendMessage}>
        {m.userinfoaction__send_message()}
      </Button>
    </Paper>
  )
}
