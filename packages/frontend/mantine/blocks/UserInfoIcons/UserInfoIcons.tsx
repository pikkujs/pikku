import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { AtSign, PhoneCall } from 'lucide-react'
import { Avatar, Group, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './UserInfoIcons.module.css'

type UserInfoIconsProps = {
  // The user — opaque data, passed via asI18n(...), never translated.
  name?: I18nString
  email?: I18nString
  phone?: I18nString
  // Avatar image URL.
  image?: string
}

export const UserInfoIcons: FC<UserInfoIconsProps> = ({
  name = asI18n('Robert Glassbreaker'),
  email = asI18n('robert@glassbreaker.io'),
  phone = asI18n('+11 (876) 890 56 23'),
  image = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
}) => {
  return (
    <div>
      <Group wrap="nowrap">
        <Avatar src={image} size={94} radius="md" name={name} />
        <div>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed">
            {m.userinfoicons__role()}
          </Text>

          <Text fz="lg" fw={500}>
            {name}
          </Text>

          <Group wrap="nowrap" gap={10} mt={3}>
            <AtSign strokeWidth={1.5} size={16} className={classes.icon} />
            <Text fz="xs" c="dimmed">
              {email}
            </Text>
          </Group>

          <Group wrap="nowrap" gap={10} mt={5}>
            <PhoneCall strokeWidth={1.5} size={16} className={classes.icon} />
            <Text fz="xs" c="dimmed">
              {phone}
            </Text>
          </Group>
        </div>
      </Group>
    </div>
  )
}
