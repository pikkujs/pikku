import { Group, Text, Button, Box } from '@pikku/mantine/core'
import { UserCog } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'

export const ImpersonationBanner: React.FC = () => {
  useLocale()
  const impersonation = useOptionalImpersonation()
  const target = impersonation?.target

  if (!target) {
    return null
  }

  return (
    <Box
      pos="fixed"
      top={0}
      left={0}
      right={0}
      px="md"
      py={6}
      style={{
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-yellow-6)',
        color: 'var(--mantine-color-black)',
      }}
    >
      <Group justify="center" gap="sm">
        <UserCog size={16} />
        <Text size="sm" fw={500}>
          {m.impersonate_banner({ email: target.email })}
        </Text>
        <Button
          size="compact-xs"
          variant="filled"
          color="dark"
          onClick={() => impersonation!.clear()}
        >
          {m.impersonate_stop()}
        </Button>
      </Group>
    </Box>
  )
}
