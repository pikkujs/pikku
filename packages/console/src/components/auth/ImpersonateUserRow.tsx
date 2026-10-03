import { Group, Avatar, UnstyledButton, Text, Box } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { AuthUser } from '../../context/AuthContext'

type ImpersonateUserRowProps = {
  user: AuthUser
  active: boolean
  onClick: () => void
}

export const ImpersonateUserRow: React.FC<ImpersonateUserRowProps> = ({
  user,
  active,
  onClick,
}) => (
  <UnstyledButton
    onClick={onClick}
    p="xs"
    data-testid="impersonate-user"
    style={{
      borderRadius: 6,
      backgroundColor: active ? 'var(--mantine-color-yellow-light)' : undefined,
    }}
  >
    <Group gap="sm" wrap="nowrap">
      <Avatar src={user.image ?? undefined} radius="xl" size="sm">
        {(user.name ?? user.email).slice(0, 1).toUpperCase()}
      </Avatar>
      <Box style={{ minWidth: 0 }}>
        {user.name && (
          <Text size="sm" fw={500} truncate>
            {asI18n(user.name)}
          </Text>
        )}
        <Text size="xs" c="dimmed" truncate>
          {asI18n(user.email)}
        </Text>
      </Box>
    </Group>
  </UnstyledButton>
)
