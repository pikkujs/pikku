import { Anchor, Group, PasswordInput, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

export function ForgotPasswordInput() {
  return (
    <>
      <Group justify="space-between" mb={5}>
        <Text component="label" htmlFor="your-password" size="sm" fw={500}>
          {m.forgotpasswordinput__label()}
        </Text>

        <Anchor href="#" onClick={(event) => event.preventDefault()} pt={2} fw={500} fz="xs">
          {m.forgotpasswordinput__forgot()}
        </Anchor>
      </Group>
      <PasswordInput placeholder={m.forgotpasswordinput__placeholder()} id="your-password" />
    </>
  )
}
