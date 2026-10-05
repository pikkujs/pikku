import {
  Anchor,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './AuthenticationTitle.module.css'

export function AuthenticationTitle() {
  return (
    <Container size={420} my={40}>
      <Title ta="center" className={classes.title}>
        {m.authenticationtitle__title()}
      </Title>

      <Text className={classes.subtitle}>
        {m.authenticationtitle__no_account()}
        {asI18n(' ')}
        <Anchor>{m.authenticationtitle__create_account()}</Anchor>
      </Text>

      <Paper withBorder shadow="sm" p={22} mt={30} radius="md">
        <TextInput
          label={m.authenticationtitle__email()}
          placeholder={m.authenticationtitle__email_placeholder()}
          required
          radius="md"
        />
        <PasswordInput
          label={m.authenticationtitle__password()}
          placeholder={m.authenticationtitle__password_placeholder()}
          required
          mt="md"
          radius="md"
        />
        <Group justify="space-between" mt="lg">
          <Checkbox label={m.authenticationtitle__remember_me()} />
          <Anchor component="button" size="sm">
            {m.authenticationtitle__forgot_password()}
          </Anchor>
        </Group>
        <Button fullWidth mt="xl" radius="md">
          {m.authenticationtitle__sign_in()}
        </Button>
      </Paper>
    </Container>
  )
}
