import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { ChevronRight } from 'lucide-react'
import { Avatar, Group, Text, UnstyledButton } from '@pikku/mantine/core'
import classes from './UserButton.module.css'

type UserButtonProps = {
  // The signed-in user's display name and email. These are opaque data (not UI
  // copy), so callers pass them via asI18n(...) — never translated.
  name: I18nString
  email: I18nString
  // Avatar image URL; falls back to initials when omitted.
  image?: string
  onClick?: () => void
}

export const UserButton: FC<UserButtonProps> = ({ name, email, image, onClick }) => {
  return (
    <UnstyledButton className={classes.user} onClick={onClick}>
      <Group>
        <Avatar src={image} radius="xl" name={name} color="initials" />

        <div style={{ flex: 1 }}>
          <Text size="sm" fw={500}>
            {name}
          </Text>

          <Text c="dimmed" size="xs">
            {email}
          </Text>
        </div>

        <ChevronRight size={14} strokeWidth={1.5} />
      </Group>
    </UnstyledButton>
  )
}
