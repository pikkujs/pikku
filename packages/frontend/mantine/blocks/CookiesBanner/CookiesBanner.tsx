import { Button, CloseButton, Group, Paper, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

export function CookiesBanner() {
  return (
    <Paper withBorder p="lg" radius="md" shadow="md">
      <Group justify="space-between" mb="xs">
        <Text fz="md" fw={500}>
          {m.cookiesbanner__title()}
        </Text>
        <CloseButton mr={-9} mt={-9} aria-label={m.cookiesbanner__close_aria()} />
      </Group>
      <Text c="dimmed" fz="xs">
        {m.cookiesbanner__body()}
      </Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" size="xs">
          {m.cookiesbanner__preferences()}
        </Button>
        <Button variant="outline" size="xs">
          {m.cookiesbanner__accept_all()}
        </Button>
      </Group>
    </Paper>
  )
}
