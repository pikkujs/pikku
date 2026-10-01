import {
  Anchor,
  Button,
  Checkbox,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './AuthenticationImage.module.css'

// Opaque demo backdrop — an image URL is not translatable UI copy, so it stays a
// plain sample string (swap for your own asset).
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1484242857719-4b9144542727?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1280&q=80'

export function AuthenticationImage() {
  return (
    <div className={classes.wrapper} style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
      <Paper className={classes.form}>
        <Title order={2} className={classes.title}>
          {m.authenticationimage__title()}
        </Title>

        <TextInput
          label={m.authenticationimage__email()}
          placeholder={m.authenticationimage__email_placeholder()}
          size="md"
          radius="md"
        />
        <PasswordInput
          label={m.authenticationimage__password()}
          placeholder={m.authenticationimage__password_placeholder()}
          mt="md"
          size="md"
          radius="md"
        />
        <Checkbox label={m.authenticationimage__keep_logged_in()} mt="xl" size="md" />
        <Button fullWidth mt="xl" size="md" radius="md">
          {m.authenticationimage__login()}
        </Button>

        <Text ta="center" mt="md">
          {m.authenticationimage__no_account()}
          {asI18n(' ')}
          <Anchor href="#" fw={500} onClick={(event) => event.preventDefault()}>
            {m.authenticationimage__register()}
          </Anchor>
        </Text>
      </Paper>
    </div>
  )
}
