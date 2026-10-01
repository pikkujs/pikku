import { ArrowLeft } from 'lucide-react'
import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './ForgotPassword.module.css'

export function ForgotPassword() {
  return (
    <Container size={460} my={30}>
      <Title className={classes.title} ta="center">
        {m.forgotpassword__title()}
      </Title>
      <Text c="dimmed" fz="sm" ta="center">
        {m.forgotpassword__subtitle()}
      </Text>

      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <TextInput
          label={m.forgotpassword__email()}
          placeholder={m.forgotpassword__email_placeholder()}
          required
        />
        <Group justify="space-between" mt="lg" className={classes.controls}>
          <Anchor c="dimmed" size="sm" className={classes.control}>
            <Center inline>
              <ArrowLeft size={12} strokeWidth={1.5} />
              <Box ml={5}>{m.forgotpassword__back()}</Box>
            </Center>
          </Anchor>
          <Button className={classes.control}>{m.forgotpassword__reset()}</Button>
        </Group>
      </Paper>
    </Container>
  )
}
